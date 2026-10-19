/**
 * "Listen on …" links for a recognised track (Spotify, YouTube Music, Apple Music).
 *
 * We do not know a track's ID on these services (our catalog holds title/artist and maybe an
 * ISRC), so every link is a **search** for "<title> <artist>" (backlog BE-15: exact links).
 * Links are https URLs: they open the service's app through universal links / Android app
 * links when it is installed, and the website otherwise.
 *
 * Whether an app is installed can only be detected where the service has a custom URL scheme
 * (docs/agent/FINDINGS.md F-033). Everything else is "unknown" and stays visible.
 */
import type { PlatformOSType } from 'react-native';

export type MusicServiceId = 'spotify' | 'youtube_music' | 'apple_music';
export type InstallStatus = 'installed' | 'not_installed' | 'unknown';
export type InstallStatuses = Record<MusicServiceId, InstallStatus>;

export interface MusicService {
  id: MusicServiceId;
  name: string;
  /** MaterialCommunityIcons glyph. */
  icon: 'spotify' | 'youtube' | 'apple';
  brandColor: string;
  /** URL whose `canOpenURL` result reveals whether the app is installed, per platform. */
  detectUrl: Partial<Record<PlatformOSType, string>>;
  searchUrl(query: string): string;
}

export const MUSIC_SERVICES: readonly MusicService[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'spotify',
    brandColor: '#1ED760',
    // iOS: LSApplicationQueriesSchemes; Android: <queries> VIEW spotify: (app.json).
    detectUrl: { ios: 'spotify:', android: 'spotify:' },
    searchUrl: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    icon: 'youtube',
    brandColor: '#FF4E45',
    // No documented URL scheme on iOS or Android: installation cannot be detected.
    detectUrl: {},
    searchUrl: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    icon: 'apple',
    brandColor: '#FA2D48',
    // music: is queryable on iOS only; Android only has app links.
    detectUrl: { ios: 'music:' },
    searchUrl: (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}`,
  },
];

export const ALL_UNKNOWN: InstallStatuses = {
  spotify: 'unknown',
  youtube_music: 'unknown',
  apple_music: 'unknown',
};

export function isMusicServiceId(v: unknown): v is MusicServiceId {
  return MUSIC_SERVICES.some((s) => s.id === v);
}

export function searchQuery(title: string, artist: string): string {
  return `${title} ${artist}`.replace(/\s+/g, ' ').trim();
}

/**
 * Probe which apps are installed. Expo Go and web cannot answer reliably (Expo Go uses its
 * own Info.plist/manifest; web's canOpenURL always says true), so they report "unknown".
 * A rejected probe (e.g. scheme missing from LSApplicationQueriesSchemes) is "unknown" too.
 */
export async function detectInstalled(env: {
  os: PlatformOSType;
  inExpoGo: boolean;
  canOpenURL: (url: string) => Promise<boolean>;
}): Promise<InstallStatuses> {
  if (env.inExpoGo || (env.os !== 'ios' && env.os !== 'android')) return { ...ALL_UNKNOWN };
  const entries = await Promise.all(
    MUSIC_SERVICES.map(async (service): Promise<[MusicServiceId, InstallStatus]> => {
      const url = service.detectUrl[env.os];
      if (!url) return [service.id, 'unknown'];
      try {
        return [service.id, (await env.canOpenURL(url)) ? 'installed' : 'not_installed'];
      } catch {
        return [service.id, 'unknown'];
      }
    }),
  );
  return Object.fromEntries(entries) as InstallStatuses;
}

/**
 * Services to show, in order: hide apps confirmed as not installed; the user's last choice
 * first, then installed apps, then unknown ones (stable default order otherwise). If every
 * app is confirmed missing, show all of them as web links rather than nothing.
 */
export function chooseServices(
  statuses: InstallStatuses,
  preferred: MusicServiceId | null,
): MusicService[] {
  const visible = MUSIC_SERVICES.filter((s) => statuses[s.id] !== 'not_installed');
  const pool = visible.length > 0 ? visible : [...MUSIC_SERVICES];
  const rank = (s: MusicService) =>
    s.id === preferred ? 0 : statuses[s.id] === 'installed' ? 1 : 2;
  return pool
    .map((s, index) => ({ s, index }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.index - b.index)
    .map(({ s }) => s);
}
