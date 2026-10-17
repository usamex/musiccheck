/**
 * Backend location. Set `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` (see .env.example).
 * EXPO_PUBLIC_* variables are inlined into the JS bundle at build time, so this must never
 * hold a secret. `process.env.EXPO_PUBLIC_API_BASE_URL` must be referenced literally (no
 * destructuring / dynamic access) for Expo's inlining to work.
 */
export function normalizeBaseUrl(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) return null;
  return trimmed;
}

export function getApiBaseUrl(): string | null {
  return normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
}

/** Request timeout for identify uploads (upload + server processing + response). */
export const IDENTIFY_TIMEOUT_MS = 30_000;
/** Timeout for the lightweight health probe. */
export const HEALTH_TIMEOUT_MS = 5_000;
