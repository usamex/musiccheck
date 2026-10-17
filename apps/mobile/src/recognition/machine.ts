/**
 * Recognition state machine — a PURE reducer (no React, no I/O), unit-tested in
 * ./__tests__/machine.test.ts.
 *
 *   idle ──START(mic)──▶ requesting_permission ──PERMISSION_GRANTED──▶ listening
 *     │                         └──PERMISSION_DENIED──▶ error(mic_permission_denied)
 *     └──START(file)──▶ processing(preparing)
 *   listening ──RECORDING_TICK──▶ listening (elapsed updated)
 *   listening ──RECORDING_FINISHED──▶ processing(preparing) ──UPLOAD_STARTED──▶ processing(uploading)
 *   processing ──RESPONSE_RECEIVED──▶ match_found | no_match | error | idle (cancelled)
 *   requesting_permission | listening | processing ──FAILURE──▶ error
 *   listening | processing ──CANCEL──▶ idle
 *   match_found | no_match | error ──RESET──▶ idle;   ──START──▶ (new attempt)
 *
 * Every async event carries the `attempt` it belongs to; events from an older attempt
 * (e.g. a late response after the user cancelled and started again) are ignored.
 * Invalid transitions return the SAME state object so React skips the re-render.
 */
import type { IdentifyOutcome } from '../api/client';
import type { IdentifySource, MatchedRecognitionResponse, RecognitionResponse } from '../api/types';
import { makeError, type RecognitionError } from './errors';

export type ProcessingPhase = 'preparing' | 'uploading';

export type RecognitionState =
  | { status: 'idle'; attempt: number }
  | { status: 'requesting_permission'; attempt: number; source: 'microphone' }
  | {
      status: 'listening';
      attempt: number;
      source: 'microphone';
      elapsedMs: number;
      durationMs: number;
    }
  | { status: 'processing'; attempt: number; source: IdentifySource; phase: ProcessingPhase }
  | {
      status: 'match_found';
      attempt: number;
      source: IdentifySource;
      response: MatchedRecognitionResponse;
    }
  | { status: 'no_match'; attempt: number; source: IdentifySource; response: RecognitionResponse }
  | { status: 'error'; attempt: number; source: IdentifySource; error: RecognitionError };

export type RecognitionStatusName = RecognitionState['status'];

export type RecognitionEvent =
  | { type: 'START'; attempt: number; source: IdentifySource }
  | { type: 'PERMISSION_GRANTED'; attempt: number; durationMs: number }
  | { type: 'PERMISSION_DENIED'; attempt: number; canAskAgain: boolean }
  | { type: 'RECORDING_TICK'; attempt: number; elapsedMs: number }
  | { type: 'RECORDING_FINISHED'; attempt: number }
  | { type: 'UPLOAD_STARTED'; attempt: number }
  | { type: 'RESPONSE_RECEIVED'; attempt: number; outcome: IdentifyOutcome }
  | { type: 'FAILURE'; attempt: number; error: RecognitionError }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

export const initialRecognitionState: RecognitionState = { status: 'idle', attempt: 0 };

const STARTABLE: ReadonlySet<RecognitionStatusName> = new Set([
  'idle',
  'match_found',
  'no_match',
  'error',
]);
const ACTIVE: ReadonlySet<RecognitionStatusName> = new Set([
  'requesting_permission',
  'listening',
  'processing',
]);

export function isActive(state: RecognitionState): boolean {
  return ACTIVE.has(state.status);
}

export function canStart(state: RecognitionState): boolean {
  return STARTABLE.has(state.status);
}

export function canCancel(state: RecognitionState): boolean {
  return state.status === 'listening' || state.status === 'processing';
}

export function recognitionReducer(
  state: RecognitionState,
  event: RecognitionEvent,
): RecognitionState {
  switch (event.type) {
    case 'START': {
      if (!canStart(state) || event.attempt <= state.attempt) return state;
      if (event.source === 'microphone') {
        return { status: 'requesting_permission', attempt: event.attempt, source: 'microphone' };
      }
      return { status: 'processing', attempt: event.attempt, source: 'file', phase: 'preparing' };
    }

    case 'PERMISSION_GRANTED': {
      if (state.status !== 'requesting_permission' || event.attempt !== state.attempt) return state;
      return {
        status: 'listening',
        attempt: state.attempt,
        source: 'microphone',
        elapsedMs: 0,
        durationMs: Math.max(0, event.durationMs),
      };
    }

    case 'PERMISSION_DENIED': {
      if (state.status !== 'requesting_permission' || event.attempt !== state.attempt) return state;
      return {
        status: 'error',
        attempt: state.attempt,
        source: 'microphone',
        error: makeError('mic_permission_denied', {
          code: 'permission_denied',
          canAskAgain: event.canAskAgain,
        }),
      };
    }

    case 'RECORDING_TICK': {
      if (state.status !== 'listening' || event.attempt !== state.attempt) return state;
      const elapsedMs = Math.min(state.durationMs, Math.max(state.elapsedMs, event.elapsedMs));
      if (elapsedMs === state.elapsedMs) return state;
      return { ...state, elapsedMs };
    }

    case 'RECORDING_FINISHED': {
      if (state.status !== 'listening' || event.attempt !== state.attempt) return state;
      return {
        status: 'processing',
        attempt: state.attempt,
        source: 'microphone',
        phase: 'preparing',
      };
    }

    case 'UPLOAD_STARTED': {
      if (state.status !== 'processing' || event.attempt !== state.attempt) return state;
      if (state.phase === 'uploading') return state;
      return { ...state, phase: 'uploading' };
    }

    case 'RESPONSE_RECEIVED': {
      if (state.status !== 'processing' || event.attempt !== state.attempt) return state;
      const { outcome } = event;
      const base = { attempt: state.attempt, source: state.source };
      switch (outcome.type) {
        case 'matched':
          return { status: 'match_found', ...base, response: outcome.response };
        case 'no_match':
          return { status: 'no_match', ...base, response: outcome.response };
        case 'error':
          return { status: 'error', ...base, error: outcome.error };
        case 'cancelled':
          return { status: 'idle', attempt: state.attempt };
      }
      return state;
    }

    case 'FAILURE': {
      if (!isActive(state) || event.attempt !== state.attempt) return state;
      const source: IdentifySource = state.status === 'processing' ? state.source : 'microphone';
      return { status: 'error', attempt: state.attempt, source, error: event.error };
    }

    case 'CANCEL': {
      if (!canCancel(state)) return state;
      return { status: 'idle', attempt: state.attempt };
    }

    case 'RESET': {
      if (!canStart(state) || state.status === 'idle') return state;
      return { status: 'idle', attempt: state.attempt };
    }
  }
  return state;
}
