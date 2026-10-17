/**
 * User-facing copy and formatting. Pure functions, unit-tested.
 */
import type { ProviderKind, QueryAudioInfo, RecognitionResponse } from '../api/types';
import type { ErrorKind, RecognitionError } from '../recognition/errors';

export type ErrorAction = 'retry' | 'open_settings' | 'dismiss';

export interface ErrorCopy {
  title: string;
  message: string;
  /** First action is the primary one. */
  actions: ErrorAction[];
}

const INVALID_RECORDING_COPY: Record<string, { title: string; message: string }> = {
  audio_silent: {
    title: "We couldn't hear anything",
    message: 'The recording was too quiet. Move closer to the music and try again.',
  },
  audio_too_short: {
    title: 'Recording too short',
    message: 'We need a few more seconds of audio. Try again and let it listen until the end.',
  },
  invalid_audio: {
    title: "Recording couldn't be read",
    message: 'The recording seems to be damaged. Please try again.',
  },
  empty_audio: {
    title: 'Empty recording',
    message: 'No audio was captured. Please try again.',
  },
  empty_recording: {
    title: 'Empty recording',
    message: 'No audio was captured. Please try again.',
  },
  missing_audio: {
    title: 'Empty recording',
    message: 'No audio was sent. Please try again.',
  },
  payload_too_large: {
    title: 'Recording too large',
    message: 'The recording is larger than the server accepts.',
  },
};

const MODEL_UNAVAILABLE_COPY: Record<string, string> = {
  provider_not_configured:
    'No recognition engine is configured on the server yet. Your recording reached the server, but it cannot be identified right now.',
  provider_not_ready:
    'The recognition model is not ready yet. Your recording reached the server; please try again later.',
  catalog_empty:
    'The song catalog is empty, so there is nothing to match against yet. Please try again later.',
};

export function errorCopy(error: RecognitionError): ErrorCopy {
  const kind: ErrorKind = error.kind;
  switch (kind) {
    case 'mic_permission_denied':
      return {
        title: 'Microphone access needed',
        message:
          'MusicCheck needs the microphone to hear the music around you. You can allow access in Settings.',
        actions: error.canAskAgain ? ['retry', 'open_settings'] : ['open_settings', 'dismiss'],
      };
    case 'mic_unavailable':
      return {
        title: 'Microphone unavailable',
        message:
          "We couldn't record from the microphone. It may be in use by another app or a call. Please try again.",
        actions: ['retry', 'dismiss'],
      };
    case 'network_unavailable':
      return {
        title: 'No connection',
        message:
          "We couldn't reach the MusicCheck server. Check your internet connection and try again.",
        actions: ['retry', 'dismiss'],
      };
    case 'backend_unavailable':
      if (error.code === 'api_base_url_missing') {
        return {
          title: 'App not configured',
          message:
            'No server address is configured. Set EXPO_PUBLIC_API_BASE_URL (see apps/mobile/README.md) and restart the app.',
          actions: ['dismiss'],
        };
      }
      if (error.code === 'processing_timeout') {
        return {
          title: 'Server took too long',
          message: 'The server could not finish processing the recording in time. Please try again.',
          actions: ['retry', 'dismiss'],
        };
      }
      return {
        title: 'Service unavailable',
        message: 'The MusicCheck server is having trouble right now. Please try again in a moment.',
        actions: ['retry', 'dismiss'],
      };
    case 'unsupported_audio_format':
      return {
        title: 'Unsupported audio format',
        message: "The server couldn't read this audio format.",
        actions: ['retry', 'dismiss'],
      };
    case 'invalid_recording': {
      const specific = error.code ? INVALID_RECORDING_COPY[error.code] : undefined;
      return {
        title: specific?.title ?? 'Recording problem',
        message: specific?.message ?? "The recording couldn't be used. Please try again.",
        actions: ['retry', 'dismiss'],
      };
    }
    case 'model_unavailable':
      return {
        title: 'Recognition model unavailable',
        message:
          (error.code ? MODEL_UNAVAILABLE_COPY[error.code] : undefined) ??
          'Music recognition is temporarily unavailable. Please try again later.',
        actions: ['retry', 'dismiss'],
      };
    case 'request_timeout':
      return {
        title: 'Request timed out',
        message: "The server didn't answer in time. Check your connection and try again.",
        actions: ['retry', 'dismiss'],
      };
    case 'unknown':
      return {
        title: 'Something went wrong',
        message: 'An unexpected error occurred. Please try again.',
        actions: ['retry', 'dismiss'],
      };
  }
}

/** "Identified by MusicCheck model" vs "Identified via <provider>". */
export function providerLabel(provider: string | null, kind: ProviderKind | null): string | null {
  if (kind === 'self_hosted_model') return 'Identified by MusicCheck model';
  if (kind === 'external_service') return `Identified via ${provider ?? 'an external service'}`;
  return provider ? `Identified via ${provider}` : null;
}

/** Calibrated confidence as a percentage, or null when the server did not provide one. */
export function formatConfidence(confidence: number | null): string | null {
  if (confidence === null || !Number.isFinite(confidence)) return null;
  const clamped = Math.min(1, Math.max(0, confidence));
  return `${Math.round(clamped * 100)}%`;
}

/** Raw similarity score — deliberately NOT a percentage (it is not a probability). */
export function formatScore(score: number | null): string | null {
  if (score === null || !Number.isFinite(score)) return null;
  return `Similarity score ${score.toFixed(3)} (raw, not a probability)`;
}

/** Seconds → "m:ss". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatOffset(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  return `Matched at ${formatClock(seconds)} into the track`;
}

/** Listening countdown text, e.g. "3s / 10s". */
export function formatElapsed(elapsedMs: number, durationMs: number): string {
  const total = Math.round(durationMs / 1000);
  const elapsed = Math.min(total, Math.floor(Math.max(0, elapsedMs) / 1000));
  return `${elapsed}s / ${total}s`;
}

/** Developer diagnostics for the server's view of the uploaded audio. */
export function formatQueryInfo(query: QueryAudioInfo | null): string | null {
  if (!query) return null;
  const parts = [
    query.codec ?? 'unknown codec',
    query.sample_rate !== null ? `${query.sample_rate} Hz` : 'unknown rate',
    query.channels !== null ? `${query.channels} ch` : 'unknown channels',
    `${query.duration_seconds.toFixed(2)} s`,
  ];
  return `Server decoded: ${parts.join(' · ')}`;
}

export function formatTimestamp(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function noMatchCopy(_response: RecognitionResponse | null): { title: string; message: string } {
  return {
    title: 'No match found',
    message:
      "We couldn't find this song in our catalog. Try again closer to the speaker, or with a different part of the song.",
  };
}
