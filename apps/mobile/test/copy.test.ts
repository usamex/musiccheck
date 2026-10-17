import { ERROR_KINDS, makeError } from '../src/recognition/errors';
import {
  errorCopy,
  formatClock,
  formatConfidence,
  formatElapsed,
  formatOffset,
  formatQueryInfo,
  formatScore,
  providerLabel,
} from '../src/presentation/copy';
import { QUERY_BLOCK } from './fixtures';

describe('errorCopy', () => {
  it.each(ERROR_KINDS)('has a title, message and at least one action for %s', (kind) => {
    const copy = errorCopy(makeError(kind));
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.message.length).toBeGreaterThan(0);
    expect(copy.actions.length).toBeGreaterThan(0);
  });

  it('permission denied offers Settings; retry only if the OS can ask again', () => {
    expect(errorCopy(makeError('mic_permission_denied', { canAskAgain: false })).actions[0]).toBe('open_settings');
    expect(errorCopy(makeError('mic_permission_denied', { canAskAgain: false })).actions).not.toContain('retry');
    expect(errorCopy(makeError('mic_permission_denied', { canAskAgain: true })).actions).toEqual([
      'retry',
      'open_settings',
    ]);
  });

  it('uses error.code for specific invalid-recording copy', () => {
    expect(errorCopy(makeError('invalid_recording', { code: 'audio_silent' })).title).toBe(
      "We couldn't hear anything",
    );
    expect(errorCopy(makeError('invalid_recording', { code: 'audio_too_short' })).title).toBe(
      'Recording too short',
    );
    expect(errorCopy(makeError('invalid_recording', { code: 'something_new' })).title).toBe(
      'Recording problem',
    );
  });

  it('explains model-unavailable states without blaming the user', () => {
    const c = errorCopy(makeError('model_unavailable', { code: 'provider_not_configured' }));
    expect(c.title).toBe('Recognition model unavailable');
    expect(c.message).toMatch(/reached the server/);
    expect(errorCopy(makeError('model_unavailable', { code: 'catalog_empty' })).message).toMatch(/catalog is empty/);
  });

  it('missing API URL is a configuration error without a retry button', () => {
    const c = errorCopy(makeError('backend_unavailable', { code: 'api_base_url_missing' }));
    expect(c.actions).toEqual(['dismiss']);
    expect(c.message).toMatch(/EXPO_PUBLIC_API_BASE_URL/);
  });
});

describe('result formatting', () => {
  it('labels our model vs external services', () => {
    expect(providerLabel('neural', 'self_hosted_model')).toBe('Identified by MusicCheck model');
    expect(providerLabel('acrcloud', 'external_service')).toBe('Identified via acrcloud');
    expect(providerLabel(null, null)).toBeNull();
  });

  it('shows confidence as a percentage only when present', () => {
    expect(formatConfidence(null)).toBeNull();
    expect(formatConfidence(0.873)).toBe('87%');
    expect(formatConfidence(1)).toBe('100%');
  });

  it('never formats score as a percentage', () => {
    const s = formatScore(0.91);
    expect(s).toContain('0.910');
    expect(s).not.toContain('%');
    expect(formatScore(null)).toBeNull();
  });

  it('formats offsets, clocks and elapsed time', () => {
    expect(formatClock(42.5)).toBe('0:42');
    expect(formatClock(125)).toBe('2:05');
    expect(formatOffset(42.5)).toBe('Matched at 0:42 into the track');
    expect(formatOffset(null)).toBeNull();
    expect(formatElapsed(0, 10_000)).toBe('0s / 10s');
    expect(formatElapsed(3_999, 10_000)).toBe('3s / 10s');
    expect(formatElapsed(12_000, 10_000)).toBe('10s / 10s');
  });

  it('formats the server query block for format verification', () => {
    expect(formatQueryInfo(QUERY_BLOCK)).toBe('Server decoded: aac · 44100 Hz · 1 ch · 9.98 s');
    expect(formatQueryInfo(null)).toBeNull();
  });
});
