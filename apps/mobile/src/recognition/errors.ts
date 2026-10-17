import type { QueryAudioInfo } from '../api/types';

/**
 * Every failure the recognition flow can end in. "No match" is NOT an error; it is
 * its own state in the machine.
 */
export type ErrorKind =
  | 'mic_permission_denied'
  | 'mic_unavailable'
  | 'network_unavailable'
  | 'backend_unavailable'
  | 'unsupported_audio_format'
  | 'invalid_recording'
  | 'model_unavailable'
  | 'request_timeout'
  | 'unknown';

export const ERROR_KINDS: readonly ErrorKind[] = [
  'mic_permission_denied',
  'mic_unavailable',
  'network_unavailable',
  'backend_unavailable',
  'unsupported_audio_format',
  'invalid_recording',
  'model_unavailable',
  'request_timeout',
  'unknown',
];

export interface RecognitionError {
  kind: ErrorKind;
  /** Server `error.code` (e.g. `audio_silent`) or a client-side code (e.g. `recorder_start_failed`). */
  code: string | null;
  /** Technical detail for logs / developer diagnostics. Not shown verbatim as primary copy. */
  message: string | null;
  /** Server request id when the failure came from a backend response. */
  requestId: string | null;
  /** HTTP status when the failure came from a backend response. */
  httpStatus: number | null;
  /** Server-side probe of the uploaded audio, when the server reported one. */
  query: QueryAudioInfo | null;
  /** For `mic_permission_denied`: whether the OS will show the permission prompt again. */
  canAskAgain?: boolean;
}

export function makeError(
  kind: ErrorKind,
  fields: Partial<Omit<RecognitionError, 'kind'>> = {},
): RecognitionError {
  return {
    kind,
    code: fields.code ?? null,
    message: fields.message ?? null,
    requestId: fields.requestId ?? null,
    httpStatus: fields.httpStatus ?? null,
    query: fields.query ?? null,
    ...(fields.canAskAgain !== undefined ? { canAskAgain: fields.canAskAgain } : {}),
  };
}

export function describeUnknownError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return String(e);
  } catch {
    return 'unknown error';
  }
}
