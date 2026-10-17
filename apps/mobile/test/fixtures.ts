/**
 * TEST-ONLY fixtures shaped exactly like docs/API.md responses. Never imported by app code.
 */
import type { MatchedRecognitionResponse, RecognitionResponse } from '../src/api/types';

export const QUERY_BLOCK = {
  duration_seconds: 9.98,
  analyzed_seconds: 9.98,
  container: 'mov,mp4,m4a,3gp,3g2,mj2',
  codec: 'aac',
  sample_rate: 44100,
  channels: 1,
};

export function matchedBody(overrides: Partial<RecognitionResponse> = {}): MatchedRecognitionResponse {
  return {
    request_id: 'req_7f3c9a1b2d4e4f60',
    status: 'matched',
    provider: 'neural',
    provider_kind: 'self_hosted_model',
    model_id: 'nmfp-triplet:test',
    track: {
      id: 'trk_01hf',
      title: 'Example Song',
      artist: 'Example Artist',
      album: 'Example Album',
      duration_seconds: 215.3,
      artwork_url: null,
    },
    score: 0.91,
    score_kind: 'cosine',
    confidence: null,
    matched_offset_seconds: 42.5,
    query: QUERY_BLOCK,
    error: null,
    processing_ms: 412,
    ...overrides,
  } as MatchedRecognitionResponse;
}

export function noMatchBody(): RecognitionResponse {
  return {
    request_id: 'req_nomatch',
    status: 'no_match',
    provider: 'neural',
    provider_kind: 'self_hosted_model',
    model_id: 'nmfp-triplet:test',
    track: null,
    score: 0.42,
    score_kind: 'cosine',
    confidence: null,
    matched_offset_seconds: null,
    query: QUERY_BLOCK,
    error: null,
    processing_ms: 300,
  };
}

export function errorBody(
  status: RecognitionResponse['status'],
  code: string,
  message = 'detail',
  extra: Partial<RecognitionResponse> = {},
): RecognitionResponse {
  return {
    request_id: `req_${code}`,
    status,
    provider: null,
    provider_kind: null,
    model_id: null,
    track: null,
    score: null,
    score_kind: null,
    confidence: null,
    matched_offset_seconds: null,
    query: null,
    error: { code, message },
    processing_ms: 12,
    ...extra,
  };
}
