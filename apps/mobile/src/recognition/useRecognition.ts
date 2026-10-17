/**
 * Orchestrates one recognition attempt: permission → real microphone capture (expo-audio)
 * → upload (api/client.identify) → result, driving the pure reducer in ./machine.ts.
 *
 * Guarantees:
 * - Capture auto-stops after CAPTURE_DURATION_MS.
 * - A hard safety timeout fails the attempt (`mic_unavailable`) if we are somehow still
 *   LISTENING after LISTENING_SAFETY_TIMEOUT_MS, so the UI can never stay stuck there.
 * - Every native recorder call is time-boxed and serialised (no prepare/stop overlap).
 * - Cancel while listening stops the recorder and deletes the partial file; cancel while
 *   processing aborts the upload (maps to idle, not to an error).
 * - Temporary recordings are deleted after upload, cancel or failure.
 * - Going to the background while listening cancels the capture.
 */
import { useAudioRecorder, type AudioRecorder } from 'expo-audio';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { AppState } from 'react-native';

import { hasApiBaseUrl, identify, missingBaseUrlError, type IdentifyOutcome } from '../api/client';
import type { IdentifySource } from '../api/types';
import { historyStore, makeHistoryEntry, rememberResult } from '../history';
import {
  deleteLocalFile,
  disableRecordingAudioMode,
  enableRecordingAudioMode,
  ensureMicrophonePermission,
  localFileSize,
} from './audioSession';
import { describeUnknownError, makeError, type RecognitionError } from './errors';
import { initialRecognitionState, recognitionReducer, type RecognitionState } from './machine';
import {
  CAPTURE_DURATION_MS,
  LISTENING_SAFETY_TIMEOUT_MS,
  RECORDING_OPTIONS,
  STOP_TIMEOUT_MS,
  TICK_INTERVAL_MS,
} from './recordingConfig';

type SessionPhase = 'permission' | 'listening' | 'preparing' | 'uploading';

interface Session {
  attempt: number;
  source: IdentifySource;
  phase: SessionPhase;
  tick: ReturnType<typeof setInterval> | null;
  safety: ReturnType<typeof setTimeout> | null;
  controller: AbortController | null;
}

export interface PickedAudioFile {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}

export interface RecognitionController {
  /** Start a microphone recognition (no-op while one is active). */
  start(): void;
  /** Developer tool: upload an existing audio file through the same pipeline. */
  identifyFile(file: PickedAudioFile): void;
  /** Cancel while listening or processing. */
  cancel(): void;
  /** Return to idle from a terminal state (match / no match / error). */
  reset(): void;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(describeUnknownError(e)));
      },
    );
  });
}

function readRecorderUri(r: AudioRecorder): string | null {
  try {
    const uri = r.uri;
    // Android returns "" when there is no file.
    return typeof uri === 'string' && uri.length > 0 ? uri : null;
  } catch {
    return null;
  }
}

export function useRecognition(): { state: RecognitionState } & RecognitionController {
  const [state, dispatch] = useReducer(recognitionReducer, initialRecognitionState);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderRef = useRef<AudioRecorder>(recorder);
  recorderRef.current = recorder;

  const sessionRef = useRef<Session | null>(null);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  /** Serialises native recorder operations (prepare / stop / audio-mode changes). */
  const nativeChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const controller = useMemo<RecognitionController>(() => {
    const isCurrent = (s: Session) => mountedRef.current && sessionRef.current === s;

    const clearTimers = (s: Session) => {
      if (s.tick) clearInterval(s.tick);
      if (s.safety) clearTimeout(s.safety);
      s.tick = null;
      s.safety = null;
    };

    const endSession = (s: Session) => {
      clearTimers(s);
      if (sessionRef.current === s) sessionRef.current = null;
    };

    const fail = (s: Session, error: RecognitionError) => {
      if (!isCurrent(s)) return;
      endSession(s);
      dispatch({ type: 'FAILURE', attempt: s.attempt, error });
    };

    const runNative = <T,>(task: () => Promise<T>): Promise<T> => {
      const p = nativeChainRef.current.then(task, task);
      nativeChainRef.current = p.catch(() => undefined);
      return p;
    };

    /** Only drop recording mode if no newer attempt needs the microphone. */
    const releaseAudioModeFor = (s: Session | null) =>
      runNative(async () => {
        const active = sessionRef.current;
        if (active && active !== s) return;
        await disableRecordingAudioMode();
      });

    /** Stop the recorder (if running) and delete whatever it wrote. Never throws. */
    const discardRecording = (owner: Session | null) =>
      runNative(async () => {
        const r = recorderRef.current;
        try {
          await withTimeout(r.stop(), STOP_TIMEOUT_MS, 'recorder.stop');
        } catch {
          // not recording / already released — nothing to stop
        }
        deleteLocalFile(readRecorderUri(r));
      }).then(() => releaseAudioModeFor(owner));

    const upload = async (s: Session, uri: string, meta: { deleteAfter: boolean }) => {
      const abort = new AbortController();
      s.controller = abort;
      s.phase = 'uploading';
      dispatch({ type: 'UPLOAD_STARTED', attempt: s.attempt });
      let outcome: IdentifyOutcome;
      try {
        outcome = await identify(uri, { signal: abort.signal, source: s.source });
      } catch (e) {
        // identify() is designed never to throw; this keeps a bug from freezing PROCESSING.
        outcome = {
          type: 'error',
          error: makeError('unknown', { code: 'client_exception', message: describeUnknownError(e) }),
        };
      } finally {
        s.controller = null;
        if (meta.deleteAfter) deleteLocalFile(uri);
      }
      if (!isCurrent(s)) return; // cancelled / superseded / unmounted
      if (outcome.type === 'matched') {
        const entry = makeHistoryEntry(outcome.response, s.source);
        rememberResult(entry);
        historyStore.add(entry).catch((e: unknown) => {
          console.warn('[history] could not persist result:', describeUnknownError(e));
        });
      }
      endSession(s);
      dispatch({ type: 'RESPONSE_RECEIVED', attempt: s.attempt, outcome });
    };

    const finishRecording = async (s: Session) => {
      if (!isCurrent(s) || s.phase !== 'listening') return;
      s.phase = 'preparing';
      clearTimers(s);
      dispatch({ type: 'RECORDING_FINISHED', attempt: s.attempt });

      let uri: string | null;
      try {
        uri = await runNative(async () => {
          const r = recorderRef.current;
          await withTimeout(r.stop(), STOP_TIMEOUT_MS, 'recorder.stop');
          return readRecorderUri(r);
        });
      } catch (e) {
        fail(s, makeError('mic_unavailable', { code: 'recorder_stop_failed', message: describeUnknownError(e) }));
        void discardRecording(s);
        return;
      }
      void releaseAudioModeFor(s);

      if (!isCurrent(s)) {
        deleteLocalFile(uri);
        return;
      }
      const size = uri ? localFileSize(uri) : null;
      if (!uri || size === 0) {
        fail(
          s,
          makeError('invalid_recording', {
            code: 'empty_recording',
            message: uri ? `Recorder wrote an empty file: ${uri}` : 'Recorder returned no file URI',
          }),
        );
        deleteLocalFile(uri);
        return;
      }
      await upload(s, uri, { deleteAfter: true });
    };

    const runMicrophoneSession = async (s: Session) => {
      // Don't make the user record for 10 s if the upload can't possibly happen.
      if (!hasApiBaseUrl()) {
        fail(s, missingBaseUrlError());
        return;
      }
      let permission: Awaited<ReturnType<typeof ensureMicrophonePermission>>;
      try {
        permission = await ensureMicrophonePermission();
      } catch (e) {
        fail(s, makeError('mic_unavailable', { code: 'permission_check_failed', message: describeUnknownError(e) }));
        return;
      }
      if (!isCurrent(s)) return;
      if (!permission.granted) {
        endSession(s);
        dispatch({ type: 'PERMISSION_DENIED', attempt: s.attempt, canAskAgain: permission.canAskAgain });
        return;
      }

      s.phase = 'listening';
      dispatch({ type: 'PERMISSION_GRANTED', attempt: s.attempt, durationMs: CAPTURE_DURATION_MS });
      s.safety = setTimeout(() => {
        if (!isCurrent(s) || s.phase !== 'listening') return;
        fail(
          s,
          makeError('mic_unavailable', {
            code: 'recording_stuck',
            message: `Still listening after ${LISTENING_SAFETY_TIMEOUT_MS} ms; recorder did not finish`,
          }),
        );
        void discardRecording(s);
      }, LISTENING_SAFETY_TIMEOUT_MS);

      let started: boolean;
      try {
        started = await runNative(async () => {
          if (!isCurrent(s)) return false;
          await withTimeout(enableRecordingAudioMode(), STOP_TIMEOUT_MS, 'setAudioModeAsync');
          const r = recorderRef.current;
          await withTimeout(r.prepareToRecordAsync(), STOP_TIMEOUT_MS, 'prepareToRecordAsync');
          if (!isCurrent(s)) return false;
          r.record();
          return true;
        });
      } catch (e) {
        fail(s, makeError('mic_unavailable', { code: 'recorder_start_failed', message: describeUnknownError(e) }));
        void discardRecording(s);
        return;
      }
      if (!started || !isCurrent(s)) {
        void discardRecording(s);
        return;
      }

      const startedAt = Date.now();
      s.tick = setInterval(() => {
        if (!isCurrent(s) || s.phase !== 'listening') return;
        const elapsedMs = Date.now() - startedAt;
        dispatch({ type: 'RECORDING_TICK', attempt: s.attempt, elapsedMs });
        if (elapsedMs >= CAPTURE_DURATION_MS) void finishRecording(s);
      }, TICK_INTERVAL_MS);
    };

    const newSession = (source: IdentifySource, phase: SessionPhase): Session => {
      const s: Session = {
        attempt: ++attemptRef.current,
        source,
        phase,
        tick: null,
        safety: null,
        controller: null,
      };
      sessionRef.current = s;
      dispatch({ type: 'START', attempt: s.attempt, source });
      return s;
    };

    const cancel = () => {
      const s = sessionRef.current;
      if (!s || s.phase === 'permission') return;
      const wasListening = s.phase === 'listening';
      s.controller?.abort();
      endSession(s);
      dispatch({ type: 'CANCEL' });
      if (wasListening) void discardRecording(null);
      // If we were 'preparing', finishRecording() sees the session is gone and deletes the file.
    };

    return {
      start: () => {
        if (sessionRef.current) return;
        void runMicrophoneSession(newSession('microphone', 'permission'));
      },
      identifyFile: (file) => {
        if (sessionRef.current) return;
        const s = newSession('file', 'preparing');
        // The picker's cache copy is left to the OS; only our own recordings are deleted.
        void upload(s, file.uri, { deleteAfter: false });
      },
      cancel,
      reset: () => {
        if (sessionRef.current) return;
        dispatch({ type: 'RESET' });
      },
    };
  }, []);

  // Cancel a capture when the app is backgrounded (the OS would cut the mic anyway).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && sessionRef.current?.phase === 'listening') controller.cancel();
    });
    return () => sub.remove();
  }, [controller]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const s = sessionRef.current;
      if (s) {
        if (s.tick) clearInterval(s.tick);
        if (s.safety) clearTimeout(s.safety);
        s.controller?.abort();
        sessionRef.current = null;
      }
    };
  }, []);

  return { state, ...controller };
}
