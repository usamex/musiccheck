/**
 * TypeScript mirror of the MusicCheck HTTP contract (docs/API.md, v1).
 *
 * Field names are snake_case exactly as they appear on the wire. Keep this file in
 * sync with docs/API.md and packages/shared/openapi.json; do not rename fields here.
 */

/** `status` of a `RecognitionResponse`. Clients branch on this, never on HTTP status alone. */
export type RecognitionStatus =
  | 'matched'
  | 'no_match'
  | 'invalid_input'
  | 'provider_unavailable'
  | 'error';

/** Distinguishes our own model from external recognition services. */
export type ProviderKind = 'self_hosted_model' | 'external_service';

/** Value of the multipart `source` field. Informational only. */
export type IdentifySource = 'microphone' | 'file';

/** `error` object inside a `RecognitionResponse` and in the generic error envelope. */
export interface ApiErrorInfo {
  code: string;
  message: string;
}

/** `track` object of a `RecognitionResponse` (a subset of the catalog `Track`). */
export interface RecognitionTrack {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number | null;
  artwork_url: string | null;
}

/** `query` block: what the server decoded from the uploaded audio. */
export interface QueryAudioInfo {
  duration_seconds: number;
  analyzed_seconds: number;
  container: string;
  codec: string | null;
  /** Sample rate of the uploaded stream (not the analysis rate). */
  sample_rate: number | null;
  channels: number | null;
}

/** Body of `POST /v1/recognition/identify`, whatever the HTTP status. */
export interface RecognitionResponse {
  request_id: string;
  status: RecognitionStatus;
  provider: string | null;
  provider_kind: ProviderKind | null;
  model_id: string | null;
  track: RecognitionTrack | null;
  /** Provider-specific match strength. NOT a probability; never display as a percentage. */
  score: number | null;
  score_kind: string | null;
  /** Calibrated probability of correctness in [0, 1], or null until calibrated. */
  confidence: number | null;
  matched_offset_seconds: number | null;
  query: QueryAudioInfo | null;
  error: ApiErrorInfo | null;
  processing_ms: number;
}

/** A `RecognitionResponse` whose status is `matched` (track is guaranteed). */
export type MatchedRecognitionResponse = RecognitionResponse & {
  status: 'matched';
  track: RecognitionTrack;
};

/** `GET /health` body. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
}

/** Generic error envelope for non-recognition endpoints. */
export interface ErrorEnvelope {
  request_id: string;
  error: ApiErrorInfo;
}
