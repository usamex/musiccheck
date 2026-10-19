import {
  ALL_UNKNOWN,
  chooseServices,
  detectInstalled,
  MUSIC_SERVICES,
  searchQuery,
  type InstallStatuses,
} from '../src/listen/services';

const byId = (id: string) => MUSIC_SERVICES.find((s) => s.id === id)!;
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe('search links', () => {
  it('builds a "title artist" query with collapsed whitespace', () => {
    expect(searchQuery('  Get   Lucky ', 'Daft Punk')).toBe('Get Lucky Daft Punk');
  });

  it('encodes the query for every service', () => {
    const q = searchQuery('Rock & Roll #1', 'AC/DC ü');
    expect(byId('spotify').searchUrl(q)).toBe(
      'https://open.spotify.com/search/Rock%20%26%20Roll%20%231%20AC%2FDC%20%C3%BC',
    );
    expect(byId('youtube_music').searchUrl(q)).toBe(
      'https://music.youtube.com/search?q=Rock%20%26%20Roll%20%231%20AC%2FDC%20%C3%BC',
    );
    expect(byId('apple_music').searchUrl(q)).toBe(
      'https://music.apple.com/search?term=Rock%20%26%20Roll%20%231%20AC%2FDC%20%C3%BC',
    );
  });

  it('only uses https links (they fall back to the website when the app is missing)', () => {
    for (const s of MUSIC_SERVICES) expect(s.searchUrl('x')).toMatch(/^https:\/\//);
  });
});

describe('detectInstalled', () => {
  const probe = (installed: string[]) =>
    jest.fn(async (url: string) => installed.includes(url));

  it('detects Spotify and Apple Music on iOS; YouTube Music stays unknown', async () => {
    const canOpenURL = probe(['spotify:']);
    await expect(detectInstalled({ os: 'ios', inExpoGo: false, canOpenURL })).resolves.toEqual({
      spotify: 'installed',
      youtube_music: 'unknown',
      apple_music: 'not_installed',
    });
    expect(canOpenURL.mock.calls.map((c) => c[0]).sort()).toEqual(['music:', 'spotify:']);
  });

  it('only probes Spotify on Android', async () => {
    const canOpenURL = probe([]);
    await expect(
      detectInstalled({ os: 'android', inExpoGo: false, canOpenURL }),
    ).resolves.toEqual({ spotify: 'not_installed', youtube_music: 'unknown', apple_music: 'unknown' });
    expect(canOpenURL).toHaveBeenCalledTimes(1);
  });

  it('treats a rejected probe as unknown', async () => {
    const canOpenURL = jest.fn(async () => {
      throw new Error('scheme not in LSApplicationQueriesSchemes');
    });
    await expect(detectInstalled({ os: 'ios', inExpoGo: false, canOpenURL })).resolves.toEqual(
      ALL_UNKNOWN,
    );
  });

  it.each([
    ['Expo Go', 'ios', true],
    ['web', 'web', false],
  ] as const)('does not probe in %s', async (_label, os, inExpoGo) => {
    const canOpenURL = probe(['spotify:', 'music:']);
    await expect(detectInstalled({ os, inExpoGo, canOpenURL })).resolves.toEqual(ALL_UNKNOWN);
    expect(canOpenURL).not.toHaveBeenCalled();
  });
});

describe('chooseServices', () => {
  const statuses = (s: Partial<InstallStatuses>): InstallStatuses => ({ ...ALL_UNKNOWN, ...s });

  it('shows everything in default order when nothing is known', () => {
    expect(ids(chooseServices(ALL_UNKNOWN, null))).toEqual([
      'spotify',
      'youtube_music',
      'apple_music',
    ]);
  });

  it('hides apps confirmed as not installed and puts installed apps first', () => {
    expect(
      ids(chooseServices(statuses({ spotify: 'not_installed', apple_music: 'installed' }), null)),
    ).toEqual(['apple_music', 'youtube_music']);
  });

  it("puts the user's last choice first", () => {
    expect(
      ids(chooseServices(statuses({ spotify: 'installed' }), 'youtube_music')),
    ).toEqual(['youtube_music', 'spotify', 'apple_music']);
  });

  it('falls back to all services when every app is confirmed missing', () => {
    const none: InstallStatuses = {
      spotify: 'not_installed',
      youtube_music: 'not_installed',
      apple_music: 'not_installed',
    };
    expect(chooseServices(none, null)).toHaveLength(3);
  });
});
