/**
 * Defensive runtime validation of server JSON against the contract in ./types.ts.
 * Anything that does not match the contract is rejected (returns null) rather than
 * being half-trusted by the UI.
 */
import type {
  ApiErrorInfo,
  HealthResponse,
  MatchedRecognitionResponse,
  ProviderKind,
  QueryAudioInfo,
  RecognitionResponse,
  RecognitionStatus,
  RecognitionTrack,
} from './types';

type Obj = Record<string, unknown>;

const STATUSES: readonly RecognitionStatus[] = [
  'matched',
  'no_match',
  'invalid_input',
  'provider_unavailable',
  'error',
];
const PROVIDER_KINDS: readonly ProviderKind[] = ['self_hosted_model', 'external_service'];

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Optional/nullable string: missing or null → null; wrong type → undefined (invalid). */
function optString(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? v : undefined;
}

function optNumber(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return isFiniteNumber(v) ? v : undefined;
}

export function parseErrorInfo(v: unknown): ApiErrorInfo | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObj(v) || typeof v.code !== 'string') return undefined;
  return { code: v.code, message: typeof v.message === 'string' ? v.message : '' };
}

export function parseTrack(v: unknown): RecognitionTrack | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObj(v)) return undefined;
  if (typeof v.id !== 'string' || typeof v.title !== 'string' || typeof v.artist !== 'string') {
    return undefined;
  }
  const album = optString(v.album);
  const duration = optNumber(v.duration_seconds);
  const artwork = optString(v.artwork_url);
  if (album === undefined || duration === undefined || artwork === undefined) return undefined;
  return {
    id: v.id,
    title: v.title,
    artist: v.artist,
    album,
    duration_seconds: duration,
    artwork_url: artwork,
  };
}

export function parseQuery(v: unknown): QueryAudioInfo | null | undefined {
  if (v === undefined || v === null) return null;
  if (!isObj(v)) return undefined;
  if (!isFiniteNumber(v.duration_seconds) || !isFiniteNumber(v.analyzed_seconds)) return undefined;
  if (typeof v.container !== 'string') return undefined;
  const codec = optString(v.codec);
  const sampleRate = optNumber(v.sample_rate);
  const channels = optNumber(v.channels);
  if (codec === undefined || sampleRate === undefined || channels === undefined) return undefined;
  return {
    duration_seconds: v.duration_seconds,
    analyzed_seconds: v.analyzed_seconds,
    container: v.container,
    codec,
    sample_rate: sampleRate,
    channels,
  };
}

/**
 * Validate a `RecognitionResponse`. Returns null if the body does not follow the contract
 * (wrong types, unknown status, `matched` without a track, ...).
 */
export function parseRecognitionResponse(body: unknown): RecognitionResponse | null {
  if (!isObj(body)) return null;
  if (typeof body.request_id !== 'string') return null;
  if (typeof body.status !== 'string' || !STATUSES.includes(body.status as RecognitionStatus)) {
    return null;
  }
  const status = body.status as RecognitionStatus;

  const provider = optString(body.provider);
  const providerKindRaw = optString(body.provider_kind);
  const modelId = optString(body.model_id);
  const scoreKind = optString(body.score_kind);
  const score = optNumber(body.score);
  const confidence = optNumber(body.confidence);
  const offset = optNumber(body.matched_offset_seconds);
  const track = parseTrack(body.track);
  const query = parseQuery(body.query);
  const error = parseErrorInfo(body.error);
  if (
    provider === undefined ||
    providerKindRaw === undefined ||
    modelId === undefined ||
    scoreKind === undefined ||
    score === undefined ||
    confidence === undefined ||
    offset === undefined ||
    track === undefined ||
    query === undefined ||
    error === undefined
  ) {
    return null;
  }
  if (providerKindRaw !== null && !PROVIDER_KINDS.includes(providerKindRaw as ProviderKind)) {
    return null;
  }
  // `confidence` is a probability; anything outside [0, 1] is a contract violation.
  if (confidence !== null && (confidence < 0 || confidence > 1)) return null;
  if (status === 'matched' && track === null) return null;

  const processingMs = isFiniteNumber(body.processing_ms) ? body.processing_ms : 0;

  return {
    request_id: body.request_id,
    status,
    provider,
    provider_kind: providerKindRaw as ProviderKind | null,
    model_id: modelId,
    track,
    score,
    score_kind: scoreKind,
    confidence,
    matched_offset_seconds: offset,
    query,
    error,
    processing_ms: processingMs,
  };
}

export function isMatched(r: RecognitionResponse): r is MatchedRecognitionResponse {
  return r.status === 'matched' && r.track !== null;
}

export function parseHealthResponse(body: unknown): HealthResponse | null {
  if (!isObj(body)) return null;
  if (body.status !== 'ok') return null;
  if (typeof body.service !== 'string' || typeof body.version !== 'string') return null;
  return { status: 'ok', service: body.service, version: body.version };
}
