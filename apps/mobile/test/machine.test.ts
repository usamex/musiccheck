import type { IdentifyOutcome } from '../src/api/client';
import { makeError } from '../src/recognition/errors';
import {
  canCancel,
  initialRecognitionState,
  recognitionReducer as reduce,
  type RecognitionEvent,
  type RecognitionState,
} from '../src/recognition/machine';
import { errorBody, matchedBody, noMatchBody } from './fixtures';

const DURATION = 10_000;

function run(events: RecognitionEvent[], from: RecognitionState = initialRecognitionState) {
  return events.reduce(reduce, from);
}

const listening = () =>
  run([
    { type: 'START', attempt: 1, source: 'microphone' },
    { type: 'PERMISSION_GRANTED', attempt: 1, durationMs: DURATION },
  ]);
const processing = () => run([{ type: 'RECORDING_FINISHED', attempt: 1 }], listening());

describe('recognition reducer — happy paths', () => {
  it('starts idle', () => {
    expect(initialRecognitionState).toEqual({ status: 'idle', attempt: 0 });
  });

  it('START(microphone) → requesting_permission', () => {
    const s = reduce(initialRecognitionState, { type: 'START', attempt: 1, source: 'microphone' });
    expect(s).toEqual({ status: 'requesting_permission', attempt: 1, source: 'microphone' });
  });

  it('PERMISSION_GRANTED → listening with elapsed 0', () => {
    expect(listening()).toEqual({
      status: 'listening',
      attempt: 1,
      source: 'microphone',
      elapsedMs: 0,
      durationMs: DURATION,
    });
  });

  it('RECORDING_TICK updates elapsed, clamps to duration and never goes backwards', () => {
    let s = reduce(listening(), { type: 'RECORDING_TICK', attempt: 1, elapsedMs: 3_200 });
    expect(s).toMatchObject({ status: 'listening', elapsedMs: 3_200 });
    const same = reduce(s, { type: 'RECORDING_TICK', attempt: 1, elapsedMs: 1_000 });
    expect(same).toBe(s);
    s = reduce(s, { type: 'RECORDING_TICK', attempt: 1, elapsedMs: 99_000 });
    expect(s).toMatchObject({ elapsedMs: DURATION });
  });

  it('RECORDING_FINISHED → processing(preparing) → UPLOAD_STARTED → processing(uploading)', () => {
    const p = processing();
    expect(p).toEqual({ status: 'processing', attempt: 1, source: 'microphone', phase: 'preparing' });
    const u = reduce(p, { type: 'UPLOAD_STARTED', attempt: 1 });
    expect(u).toEqual({ status: 'processing', attempt: 1, source: 'microphone', phase: 'uploading' });
    expect(reduce(u, { type: 'UPLOAD_STARTED', attempt: 1 })).toBe(u);
  });

  it('START(file) skips the microphone and goes straight to processing', () => {
    const s = reduce(initialRecognitionState, { type: 'START', attempt: 1, source: 'file' });
    expect(s).toEqual({ status: 'processing', attempt: 1, source: 'file', phase: 'preparing' });
  });

  const outcomes: [string, IdentifyOutcome, string][] = [
    ['matched', { type: 'matched', response: matchedBody() }, 'match_found'],
    ['no_match', { type: 'no_match', response: noMatchBody() }, 'no_match'],
    [
      'error',
      { type: 'error', error: makeError('model_unavailable', { code: 'provider_not_configured' }) },
      'error',
    ],
    ['cancelled', { type: 'cancelled' }, 'idle'],
  ];
  it.each(outcomes)('RESPONSE_RECEIVED(%s) → %s', (_name, outcome, expected) => {
    const s = reduce(processing(), { type: 'RESPONSE_RECEIVED', attempt: 1, outcome });
    expect(s.status).toBe(expected);
    expect(s.attempt).toBe(1);
  });

  it('match_found carries the response; no_match is not an error', () => {
    const m = reduce(processing(), {
      type: 'RESPONSE_RECEIVED',
      attempt: 1,
      outcome: { type: 'matched', response: matchedBody() },
    });
    expect(m.status === 'match_found' && m.response.track.title).toBe('Example Song');
    const n = reduce(processing(), {
      type: 'RESPONSE_RECEIVED',
      attempt: 1,
      outcome: { type: 'no_match', response: noMatchBody() },
    });
    expect(n.status).toBe('no_match');
    expect('error' in n).toBe(false);
  });

  it('model unavailable (503 provider_unavailable) ends in error/model_unavailable', () => {
    const s = reduce(processing(), {
      type: 'RESPONSE_RECEIVED',
      attempt: 1,
      outcome: {
        type: 'error',
        error: makeError('model_unavailable', { code: 'provider_not_configured', httpStatus: 503 }),
      },
    });
    expect(s).toMatchObject({ status: 'error', error: { kind: 'model_unavailable' } });
  });
});

describe('recognition reducer — permission and failures', () => {
  it('PERMISSION_DENIED → error(mic_permission_denied) carrying canAskAgain', () => {
    const s = run([
      { type: 'START', attempt: 1, source: 'microphone' },
      { type: 'PERMISSION_DENIED', attempt: 1, canAskAgain: false },
    ]);
    expect(s).toMatchObject({
      status: 'error',
      source: 'microphone',
      error: { kind: 'mic_permission_denied', canAskAgain: false },
    });
  });

  it.each([
    ['requesting_permission', () => run([{ type: 'START', attempt: 1, source: 'microphone' }])],
    ['listening', listening],
    ['processing', processing],
  ] as const)('FAILURE from %s → error', (_n, make) => {
    const err = makeError('mic_unavailable', { code: 'recorder_start_failed' });
    const s = reduce(make(), { type: 'FAILURE', attempt: 1, error: err });
    expect(s).toEqual({ status: 'error', attempt: 1, source: 'microphone', error: err });
  });

  it('FAILURE in a file upload keeps source=file', () => {
    const p = reduce(initialRecognitionState, { type: 'START', attempt: 1, source: 'file' });
    const s = reduce(p, {
      type: 'FAILURE',
      attempt: 1,
      error: makeError('unknown'),
    });
    expect(s).toMatchObject({ status: 'error', source: 'file' });
  });
});

describe('recognition reducer — cancel and reset', () => {
  it('CANCEL from listening → idle', () => {
    expect(reduce(listening(), { type: 'CANCEL' })).toEqual({ status: 'idle', attempt: 1 });
  });

  it('CANCEL from processing (both phases) → idle', () => {
    expect(reduce(processing(), { type: 'CANCEL' })).toEqual({ status: 'idle', attempt: 1 });
    const uploading = reduce(processing(), { type: 'UPLOAD_STARTED', attempt: 1 });
    expect(reduce(uploading, { type: 'CANCEL' })).toEqual({ status: 'idle', attempt: 1 });
  });

  it('CANCEL is ignored in idle, requesting_permission and terminal states', () => {
    const idle = initialRecognitionState;
    expect(reduce(idle, { type: 'CANCEL' })).toBe(idle);
    const req = run([{ type: 'START', attempt: 1, source: 'microphone' }]);
    expect(reduce(req, { type: 'CANCEL' })).toBe(req);
    const err = reduce(listening(), { type: 'FAILURE', attempt: 1, error: makeError('unknown') });
    expect(reduce(err, { type: 'CANCEL' })).toBe(err);
  });

  it('canCancel only for listening/processing', () => {
    expect(canCancel(listening())).toBe(true);
    expect(canCancel(processing())).toBe(true);
    expect(canCancel(initialRecognitionState)).toBe(false);
  });

  it('RESET from terminal states → idle; ignored while active', () => {
    const matched = reduce(processing(), {
      type: 'RESPONSE_RECEIVED',
      attempt: 1,
      outcome: { type: 'matched', response: matchedBody() },
    });
    expect(reduce(matched, { type: 'RESET' })).toEqual({ status: 'idle', attempt: 1 });
    const l = listening();
    expect(reduce(l, { type: 'RESET' })).toBe(l);
    const p = processing();
    expect(reduce(p, { type: 'RESET' })).toBe(p);
    expect(reduce(initialRecognitionState, { type: 'RESET' })).toBe(initialRecognitionState);
  });

  it('a new START is allowed from match_found / no_match / error', () => {
    const terminals: RecognitionState[] = [
      { status: 'match_found', attempt: 1, source: 'microphone', response: matchedBody() },
      { status: 'no_match', attempt: 1, source: 'microphone', response: noMatchBody() },
      {
        status: 'error',
        attempt: 1,
        source: 'microphone',
        error: makeError('network_unavailable'),
      },
    ];
    for (const t of terminals) {
      expect(reduce(t, { type: 'START', attempt: 2, source: 'microphone' })).toEqual({
        status: 'requesting_permission',
        attempt: 2,
        source: 'microphone',
      });
    }
  });
});

describe('recognition reducer — invalid transitions are ignored (same object)', () => {
  const cases: [string, () => RecognitionState, RecognitionEvent][] = [
    ['START while listening', listening, { type: 'START', attempt: 2, source: 'microphone' }],
    ['START while processing', processing, { type: 'START', attempt: 2, source: 'file' }],
    [
      'START with a non-increasing attempt',
      () => ({ status: 'error', attempt: 3, source: 'microphone', error: makeError('unknown') }),
      { type: 'START', attempt: 3, source: 'microphone' },
    ],
    ['PERMISSION_GRANTED while idle', () => initialRecognitionState, { type: 'PERMISSION_GRANTED', attempt: 0, durationMs: 1 }],
    ['PERMISSION_DENIED while listening', listening, { type: 'PERMISSION_DENIED', attempt: 1, canAskAgain: true }],
    ['RECORDING_TICK while processing', processing, { type: 'RECORDING_TICK', attempt: 1, elapsedMs: 5 }],
    ['RECORDING_FINISHED while idle', () => initialRecognitionState, { type: 'RECORDING_FINISHED', attempt: 0 }],
    ['UPLOAD_STARTED while listening', listening, { type: 'UPLOAD_STARTED', attempt: 1 }],
    [
      'RESPONSE_RECEIVED while listening',
      listening,
      { type: 'RESPONSE_RECEIVED', attempt: 1, outcome: { type: 'no_match', response: noMatchBody() } },
    ],
    [
      'RESPONSE_RECEIVED while idle (late response after cancel)',
      () => reduce(processing(), { type: 'CANCEL' }),
      { type: 'RESPONSE_RECEIVED', attempt: 1, outcome: { type: 'matched', response: matchedBody() } },
    ],
    [
      'FAILURE while idle',
      () => initialRecognitionState,
      { type: 'FAILURE', attempt: 0, error: makeError('unknown') },
    ],
    [
      'FAILURE in a terminal state',
      () => ({ status: 'no_match', attempt: 1, source: 'microphone', response: noMatchBody() }),
      { type: 'FAILURE', attempt: 1, error: makeError('unknown') },
    ],
  ];
  it.each(cases)('%s', (_name, make, event) => {
    const s = make();
    expect(reduce(s, event)).toBe(s);
  });

  it('events from a stale attempt are ignored', () => {
    // attempt 1 was cancelled, attempt 2 is now processing
    const p2 = run(
      [
        { type: 'START', attempt: 2, source: 'microphone' },
        { type: 'PERMISSION_GRANTED', attempt: 2, durationMs: DURATION },
        { type: 'RECORDING_FINISHED', attempt: 2 },
      ],
      reduce(listening(), { type: 'CANCEL' }),
    );
    expect(p2).toMatchObject({ status: 'processing', attempt: 2 });
    const stale: RecognitionEvent[] = [
      { type: 'RESPONSE_RECEIVED', attempt: 1, outcome: { type: 'matched', response: matchedBody() } },
      { type: 'FAILURE', attempt: 1, error: makeError('request_timeout') },
      { type: 'UPLOAD_STARTED', attempt: 1 },
    ];
    for (const e of stale) expect(reduce(p2, e)).toBe(p2);
    const stillListening = listening();
    expect(reduce(stillListening, { type: 'RECORDING_TICK', attempt: 0, elapsedMs: 5_000 })).toBe(stillListening);
  });

  it('an error response does not need a track', () => {
    const s = reduce(processing(), {
      type: 'RESPONSE_RECEIVED',
      attempt: 1,
      outcome: {
        type: 'error',
        error: makeError('invalid_recording', { code: errorBody('invalid_input', 'audio_silent').error!.code }),
      },
    });
    expect(s).toMatchObject({ status: 'error', error: { kind: 'invalid_recording', code: 'audio_silent' } });
  });
});
