/**
 * Orchestration tests for useRecognition with TEST DOUBLES for every native boundary:
 * expo-audio (recorder + permissions), expo-file-system (File), the API client and the
 * history store. These prove the control flow (auto-stop, cancel, safety timeout, cleanup),
 * NOT that the real microphone works — that needs a device (docs/MOBILE_TEST_PLAN.md).
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import type { IdentifyOutcome } from '../src/api/client';
import { useRecognition } from '../src/recognition/useRecognition';
import { CAPTURE_DURATION_MS, LISTENING_SAFETY_TIMEOUT_MS } from '../src/recognition/recordingConfig';
import { matchedBody, noMatchBody } from './fixtures';

const REC_URI = 'file:///cache/ExpoAudio/recording-test.m4a';

const mockRecorder = {
  uri: REC_URI as string | null,
  prepareToRecordAsync: jest.fn<Promise<void>, []>(async () => undefined),
  record: jest.fn(),
  stop: jest.fn<Promise<void>, []>(async () => undefined),
};
const mockPermissions = {
  get: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  request: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
};
const mockSetAudioMode = jest.fn(async (_mode: Record<string, unknown>) => undefined);
const mockFiles = { size: 160_000, exists: true, deleted: [] as string[] };

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => mockRecorder,
  getRecordingPermissionsAsync: () => mockPermissions.get(),
  requestRecordingPermissionsAsync: () => mockPermissions.request(),
  setAudioModeAsync: (mode: Record<string, unknown>) => mockSetAudioMode(mode),
  AudioQuality: { MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    get exists() {
      return mockFiles.exists && !mockFiles.deleted.includes(uri);
    },
    get size() {
      return mockFiles.size;
    },
    delete: () => mockFiles.deleted.push(uri),
  })),
}));

const mockIdentify = jest.fn<Promise<IdentifyOutcome>, [string, { signal?: AbortSignal; source?: string }]>();
const mockApi = { configured: true };
jest.mock('../src/api/client', () => ({
  identify: (uri: string, opts: { signal?: AbortSignal; source?: string }) => mockIdentify(uri, opts),
  hasApiBaseUrl: () => mockApi.configured,
  missingBaseUrlError: jest.requireActual('../src/api/client').missingBaseUrlError,
}));

const mockHistoryAdd = jest.fn(async (_e: unknown) => []);
const mockRemember = jest.fn();
jest.mock('../src/history', () => {
  const actual = jest.requireActual('../src/history/historyStore');
  return {
    historyStore: { add: (e: unknown) => mockHistoryAdd(e) },
    makeHistoryEntry: actual.makeHistoryEntry,
    rememberResult: (e: unknown) => mockRemember(e),
  };
});

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function setup() {
  const hook = await renderHook(() => useRecognition());
  return hook;
}

async function startAndWaitListening(hook: Awaited<ReturnType<typeof setup>>) {
  await act(async () => {
    hook.result.current.start();
  });
  await advance(0);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRecorder.uri = REC_URI;
  mockRecorder.prepareToRecordAsync.mockImplementation(async () => undefined);
  mockRecorder.stop.mockImplementation(async () => undefined);
  mockPermissions.get.mockImplementation(async () => ({ granted: true, canAskAgain: true, status: 'granted' }));
  mockFiles.size = 160_000;
  mockFiles.exists = true;
  mockFiles.deleted = [];
  mockApi.configured = true;
  mockIdentify.mockImplementation(async () => ({ type: 'matched', response: matchedBody() }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRecognition (native boundaries mocked)', () => {
  it('records for the capture window, auto-stops, uploads, stores the match and deletes the file', async () => {
    const hook = await setup();
    await startAndWaitListening(hook);

    expect(hook.result.current.state.status).toBe('listening');
    expect(mockSetAudioMode).toHaveBeenCalledWith(expect.objectContaining({ allowsRecording: true, playsInSilentMode: true }));
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);

    await advance(3_000);
    const s = hook.result.current.state;
    expect(s.status === 'listening' && s.elapsedMs).toBeGreaterThanOrEqual(2_800);
    expect(mockRecorder.stop).not.toHaveBeenCalled();

    await advance(CAPTURE_DURATION_MS);
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockIdentify).toHaveBeenCalledWith(REC_URI, expect.objectContaining({ source: 'microphone' }));
    expect(hook.result.current.state.status).toBe('match_found');
    expect(mockRemember).toHaveBeenCalledWith(expect.objectContaining({ id: 'req_7f3c9a1b2d4e4f60' }));
    expect(mockHistoryAdd).toHaveBeenCalledTimes(1);
    expect(mockFiles.deleted).toContain(REC_URI);
  });

  it('no_match does not touch history', async () => {
    mockIdentify.mockImplementation(async () => ({ type: 'no_match', response: noMatchBody() }));
    const hook = await setup();
    await startAndWaitListening(hook);
    await advance(CAPTURE_DURATION_MS + 500);
    expect(hook.result.current.state.status).toBe('no_match');
    expect(mockHistoryAdd).not.toHaveBeenCalled();
  });

  it('permission denied → error, recorder never prepared', async () => {
    mockPermissions.get.mockImplementation(async () => ({ granted: false, canAskAgain: false, status: 'denied' }));
    mockPermissions.request.mockImplementation(async () => ({ granted: false, canAskAgain: false, status: 'denied' }));
    const hook = await setup();
    await startAndWaitListening(hook);
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      error: { kind: 'mic_permission_denied', canAskAgain: false },
    });
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });

  it('cancel while listening → idle, recorder stopped, partial file deleted, nothing uploaded', async () => {
    const hook = await setup();
    await startAndWaitListening(hook);
    await advance(2_000);
    await act(async () => hook.result.current.cancel());
    await advance(0);
    expect(hook.result.current.state.status).toBe('idle');
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockFiles.deleted).toContain(REC_URI);
    await advance(CAPTURE_DURATION_MS * 2);
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(hook.result.current.state.status).toBe('idle');
  });

  it('cancel while processing aborts the upload and ignores its late result', async () => {
    let seenSignal: AbortSignal | undefined;
    let resolveUpload: (o: IdentifyOutcome) => void = () => undefined;
    mockIdentify.mockImplementation(
      (_uri, opts) =>
        new Promise<IdentifyOutcome>((resolve) => {
          seenSignal = opts.signal;
          resolveUpload = resolve;
        }),
    );
    const hook = await setup();
    await startAndWaitListening(hook);
    await advance(CAPTURE_DURATION_MS + 300);
    expect(hook.result.current.state).toMatchObject({ status: 'processing', phase: 'uploading' });

    await act(async () => hook.result.current.cancel());
    expect(hook.result.current.state.status).toBe('idle');
    expect(seenSignal?.aborted).toBe(true);

    await act(async () => resolveUpload({ type: 'matched', response: matchedBody() }));
    await advance(0);
    expect(hook.result.current.state.status).toBe('idle');
    expect(mockHistoryAdd).not.toHaveBeenCalled();
    expect(mockFiles.deleted).toContain(REC_URI);
  });

  it('recorder start failure → mic_unavailable', async () => {
    mockRecorder.prepareToRecordAsync.mockImplementation(async () => {
      throw new Error('AudioRecorderPrepareException');
    });
    const hook = await setup();
    await startAndWaitListening(hook);
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      error: { kind: 'mic_unavailable', code: 'recorder_start_failed' },
    });
  });

  it('a recorder that never finishes preparing cannot leave the UI in LISTENING', async () => {
    mockRecorder.prepareToRecordAsync.mockImplementation(() => new Promise<void>(() => undefined));
    const hook = await setup();
    await startAndWaitListening(hook);
    expect(hook.result.current.state.status).toBe('listening');
    await advance(LISTENING_SAFETY_TIMEOUT_MS);
    expect(hook.result.current.state).toMatchObject({ status: 'error', error: { kind: 'mic_unavailable' } });
  });

  it('hard safety timeout fires if the capture never reaches the auto-stop', async () => {
    const frozen = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(frozen); // elapsed never advances
    try {
      const hook = await setup();
      await startAndWaitListening(hook);
      await advance(LISTENING_SAFETY_TIMEOUT_MS - 100);
      expect(hook.result.current.state.status).toBe('listening');
      await advance(200);
      expect(hook.result.current.state).toMatchObject({
        status: 'error',
        error: { kind: 'mic_unavailable', code: 'recording_stuck' },
      });
      expect(mockIdentify).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('stop() failure → mic_unavailable, no upload', async () => {
    mockRecorder.stop.mockImplementation(async () => {
      throw new Error('stop failed');
    });
    const hook = await setup();
    await startAndWaitListening(hook);
    await advance(CAPTURE_DURATION_MS + 300);
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      error: { kind: 'mic_unavailable', code: 'recorder_stop_failed' },
    });
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('an empty recording file is rejected locally as invalid_recording', async () => {
    mockFiles.size = 0;
    const hook = await setup();
    await startAndWaitListening(hook);
    await advance(CAPTURE_DURATION_MS + 300);
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      error: { kind: 'invalid_recording', code: 'empty_recording' },
    });
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it('going to the background while listening cancels the capture', async () => {
    const handlers: ((s: AppStateStatus) => void)[] = [];
    // RN's jest setup already mocks AppState; swap the function and put it back afterwards
    // (spyOn + mockRestore would wipe the existing mock's implementation).
    const original = AppState.addEventListener;
    AppState.addEventListener = ((_type: string, handler: (s: AppStateStatus) => void) => {
      handlers.push(handler);
      return { remove: () => undefined };
    }) as unknown as typeof AppState.addEventListener;
    try {
      const hook = await setup();
      await startAndWaitListening(hook);
      await act(async () => handlers.forEach((h) => h('background')));
      await advance(0);
      expect(hook.result.current.state.status).toBe('idle');
      expect(mockFiles.deleted).toContain(REC_URI);
    } finally {
      AppState.addEventListener = original;
    }
  });

  it('identifyFile() uploads with source=file through the same pipeline', async () => {
    const hook = await setup();
    await act(async () => hook.result.current.identifyFile({ uri: 'file:///cache/picked.mp3' }));
    await advance(0);
    expect(mockIdentify).toHaveBeenCalledWith('file:///cache/picked.mp3', expect.objectContaining({ source: 'file' }));
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(hook.result.current.state.status).toBe('match_found');
    // the picked file is not ours to delete
    expect(mockFiles.deleted).not.toContain('file:///cache/picked.mp3');
  });

  it('without a configured API URL it fails before touching the microphone', async () => {
    mockApi.configured = false;
    const hook = await setup();
    await startAndWaitListening(hook);
    expect(hook.result.current.state).toMatchObject({
      status: 'error',
      error: { kind: 'backend_unavailable', code: 'api_base_url_missing' },
    });
    expect(mockPermissions.get).not.toHaveBeenCalled();
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });

  it('ignores start() while a recognition is already active', async () => {
    const hook = await setup();
    await startAndWaitListening(hook);
    await act(async () => hook.result.current.start());
    await advance(0);
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
  });
});
