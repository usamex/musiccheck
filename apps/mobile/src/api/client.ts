/**
 * HTTP client for the MusicCheck backend (contract: docs/API.md).
 *
 * `identify()` never throws: every outcome, including network failures, timeouts and user
 * cancellation, is returned as a typed `IdentifyOutcome`.
 *
 * Upload mechanics (Expo SDK 58): on iOS/Android the global `fetch` IS `expo/fetch`
 * (docs.expo.dev/versions/v58.0.0/sdk/expo — "expo/fetch is also installed as the global
 * fetch"). Its multipart encoder rejects React Native's legacy `{ uri, name, type }`
 * FormData descriptor ("Unsupported FormDataPart implementation", see
 * node_modules/expo/src/winter/fetch/convertFormData.ts), so the audio part is an
 * expo-file-system `File` (the documented SDK 58 way to put a local file in FormData).
 * The multipart filename is therefore the recording's own basename (e.g. `<uuid>.m4a`);
 * the backend only uses the filename's extension and probes the content with FFmpeg.
 */
import { File } from 'expo-file-system';

import { makeError, describeUnknownError, type RecognitionError } from '../recognition/errors';
import { getApiBaseUrl, HEALTH_TIMEOUT_MS, IDENTIFY_TIMEOUT_MS, normalizeBaseUrl } from './config';
import { isMatched, parseHealthResponse, parseRecognitionResponse } from './parse';
import type {
  HealthResponse,
  IdentifySource,
  MatchedRecognitionResponse,
  RecognitionResponse,
} from './types';

export type IdentifyOutcome =
  | { type: 'matched'; response: MatchedRecognitionResponse }
  | { type: 'no_match'; response: RecognitionResponse }
  | { type: 'error'; error: RecognitionError }
  /** The caller aborted via `options.signal`. Distinct from a timeout. */
  | { type: 'cancelled' };

/** Turns a local file URI into a value `FormData.append` + global fetch can upload. */
export type FilePartFactory = (fileUri: string) => Blob;

export interface IdentifyOptions {
  /** User cancellation. Aborting it yields `{ type: 'cancelled' }`. */
  signal?: AbortSignal;
  source?: IdentifySource;
  /** Overrides for tests / tooling. Production code uses the env-configured defaults. */
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  createFilePart?: FilePartFactory;
}

/** True when EXPO_PUBLIC_API_BASE_URL holds a usable http(s) URL. */
export function hasApiBaseUrl(): boolean {
  return getApiBaseUrl() !== null;
}

export const IDENTIFY_PATH = '/v1/recognition/identify';
export const HEALTH_PATH = '/health';

/** Default part factory: an expo-file-system `File` (implements Blob; streamed by expo/fetch). */
export const expoFilePart: FilePartFactory = (fileUri) => {
  const file = new File(fileUri);
  if (!file.exists) throw new Error(`Audio file does not exist: ${fileUri}`);
  return file;
};

type AbortReason = 'user' | 'timeout';

class AbortedError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

/**
 * Combines the caller's signal with a timeout, remembering which one fired so that a
 * user cancel and a timeout map to different outcomes. `guard()` races a promise against
 * the abort so we resolve promptly even if the underlying fetch ignores the signal.
 */
function createAbortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let reason: AbortReason | null = null;
  let rejectAbort: (e: Error) => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  aborted.catch(() => undefined); // avoid unhandled rejection when nobody is racing it

  const abort = (why: AbortReason) => {
    if (reason !== null) return;
    reason = why;
    controller.abort();
    rejectAbort(new AbortedError());
  };
  const onExternalAbort = () => abort('user');
  external?.addEventListener('abort', onExternalAbort);
  const timer = setTimeout(() => abort('timeout'), timeoutMs);

  return {
    signal: controller.signal,
    reason: () => reason,
    guard: <T>(p: Promise<T>): Promise<T> => Promise.race([p, aborted]),
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** Error used when no backend URL is configured (shown as "App not configured"). */
export function missingBaseUrlError(): RecognitionError {
  return makeError('backend_unavailable', {
    code: 'api_base_url_missing',
    message: 'EXPO_PUBLIC_API_BASE_URL is not set or is not an http(s) URL',
  });
}

/**
 * Maps a validated server response (+ HTTP status) to an outcome, following the
 * outcome table in docs/API.md. Exported for unit tests.
 */
export function mapRecognitionResponse(
  httpStatus: number,
  response: RecognitionResponse,
): Exclude<IdentifyOutcome, { type: 'cancelled' }> {
  const common = {
    code: response.error?.code ?? null,
    message: response.error?.message ?? null,
    requestId: response.request_id,
    httpStatus,
    query: response.query,
  };
  switch (response.status) {
    case 'matched':
      if (isMatched(response)) return { type: 'matched', response };
      return {
        type: 'error',
        error: makeError('backend_unavailable', { ...common, code: 'invalid_response' }),
      };
    case 'no_match':
      return { type: 'no_match', response };
    case 'provider_unavailable':
      return { type: 'error', error: makeError('model_unavailable', common) };
    case 'invalid_input':
      if (httpStatus === 415 || response.error?.code === 'unsupported_audio_format') {
        return { type: 'error', error: makeError('unsupported_audio_format', common) };
      }
      return { type: 'error', error: makeError('invalid_recording', common) };
    case 'error':
      return { type: 'error', error: makeError('backend_unavailable', common) };
  }
}

function abortOutcome(reason: AbortReason, timeoutMs: number): IdentifyOutcome {
  if (reason === 'user') return { type: 'cancelled' };
  return {
    type: 'error',
    error: makeError('request_timeout', {
      code: 'client_timeout',
      message: `No response within ${Math.round(timeoutMs / 1000)} s`,
    }),
  };
}

/**
 * Uploads a recording to `POST /v1/recognition/identify` and maps the result.
 * @param fileUri local `file://` URI of the audio (from expo-audio or the document picker).
 */
export async function identify(
  fileUri: string,
  options: IdentifyOptions = {},
): Promise<IdentifyOutcome> {
  const baseUrl = options.baseUrl !== undefined ? normalizeBaseUrl(options.baseUrl) : getApiBaseUrl();
  if (!baseUrl) return { type: 'error', error: missingBaseUrlError() };
  if (options.signal?.aborted) return { type: 'cancelled' };

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? IDENTIFY_TIMEOUT_MS;

  let audioPart: Blob;
  try {
    audioPart = (options.createFilePart ?? expoFilePart)(fileUri);
  } catch (e) {
    return {
      type: 'error',
      error: makeError('invalid_recording', { code: 'file_unreadable', message: describeUnknownError(e) }),
    };
  }
  const form = new FormData();
  form.append('audio', audioPart);
  form.append('source', options.source ?? 'microphone');

  const scope = createAbortScope(options.signal, timeoutMs);
  try {
    let res: Response;
    try {
      res = await scope.guard(
        fetchImpl(`${baseUrl}${IDENTIFY_PATH}`, {
          method: 'POST',
          body: form,
          // No explicit Content-Type: fetch must add the multipart boundary itself.
          headers: { Accept: 'application/json' },
          signal: scope.signal,
        }),
      );
    } catch (e) {
      const reason = scope.reason();
      if (reason) return abortOutcome(reason, timeoutMs);
      // fetch only rejects for transport-level failures. RN's polyfill throws TypeError
      // ("Network request failed"); expo/fetch (the SDK 58 global) throws FetchError
      // ("fetch failed: ..."), which is NOT a TypeError — so do not branch on the class.
      return {
        type: 'error',
        error: makeError('network_unavailable', {
          code: 'network_request_failed',
          message: `${describeUnknownError(e)} (${baseUrl})`,
        }),
      };
    }

    let body: unknown;
    try {
      body = await scope.guard(res.json() as Promise<unknown>);
    } catch (e) {
      const reason = scope.reason();
      if (reason) return abortOutcome(reason, timeoutMs);
      body = undefined; // not JSON
    }

    const parsed = parseRecognitionResponse(body);
    if (!parsed) {
      // The server did not speak the contract (proxy error page, wrong URL, old build, ...).
      return {
        type: 'error',
        error: makeError(res.status === 415 ? 'unsupported_audio_format' : 'backend_unavailable', {
          code: 'invalid_response',
          message: `HTTP ${res.status} without a valid RecognitionResponse body`,
          httpStatus: res.status,
        }),
      };
    }
    return mapRecognitionResponse(res.status, parsed);
  } catch (e) {
    // Defensive: identify() must never throw.
    return {
      type: 'error',
      error: makeError('unknown', { code: 'client_exception', message: describeUnknownError(e) }),
    };
  } finally {
    scope.dispose();
  }
}

export type HealthOutcome =
  | { ok: true; health: HealthResponse; baseUrl: string }
  | { ok: false; error: RecognitionError; baseUrl: string | null };

/** `GET /health` liveness probe (used for developer diagnostics). Never throws. */
export async function getHealth(
  options: Pick<IdentifyOptions, 'signal' | 'baseUrl' | 'fetchImpl' | 'timeoutMs'> = {},
): Promise<HealthOutcome> {
  const baseUrl = options.baseUrl !== undefined ? normalizeBaseUrl(options.baseUrl) : getApiBaseUrl();
  if (!baseUrl) return { ok: false, error: missingBaseUrlError(), baseUrl: null };
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const scope = createAbortScope(options.signal, timeoutMs);
  try {
    const res = await scope.guard(
      fetchImpl(`${baseUrl}${HEALTH_PATH}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: scope.signal,
      }),
    );
    const body: unknown = await scope.guard(res.json() as Promise<unknown>).catch(() => undefined);
    const health = res.ok ? parseHealthResponse(body) : null;
    if (health) return { ok: true, health, baseUrl };
    return {
      ok: false,
      baseUrl,
      error: makeError('backend_unavailable', {
        code: 'health_check_failed',
        message: `HTTP ${res.status}`,
        httpStatus: res.status,
      }),
    };
  } catch (e) {
    const reason = scope.reason();
    const kind = reason === 'timeout' ? 'request_timeout' : 'network_unavailable';
    return {
      ok: false,
      baseUrl,
      error: makeError(kind, { code: reason ?? 'network_request_failed', message: describeUnknownError(e) }),
    };
  } finally {
    scope.dispose();
  }
}
