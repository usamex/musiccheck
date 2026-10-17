/**
 * Screen-level smoke tests with the real expo-router navigator (expo-router/testing-library).
 * Native boundaries are TEST DOUBLES: expo-audio, expo-file-system, AsyncStorage (official
 * jest mock) and the API client. The capture window is shortened to keep tests fast.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { IdentifyOutcome } from '../src/api/client';
import RootLayout from '../src/app/_layout';
import HistoryScreen from '../src/app/history';
import HomeScreen from '../src/app/index';
import ResultScreen from '../src/app/result';
import { historyStore } from '../src/history';
import { HISTORY_STORAGE_KEY, makeHistoryEntry } from '../src/history/historyStore';
import { errorBody, matchedBody, QUERY_BLOCK } from './fixtures';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/recognition/recordingConfig', () => ({
  ...jest.requireActual('../src/recognition/recordingConfig'),
  CAPTURE_DURATION_MS: 300,
  TICK_INTERVAL_MS: 50,
  LISTENING_SAFETY_TIMEOUT_MS: 3_000,
}));

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    uri: 'file:///cache/ExpoAudio/recording-screen.m4a',
    prepareToRecordAsync: async () => undefined,
    record: () => undefined,
    stop: async () => undefined,
  }),
  getRecordingPermissionsAsync: async () => ({ granted: true, canAskAgain: true, status: 'granted' }),
  requestRecordingPermissionsAsync: async () => ({ granted: true, canAskAgain: true, status: 'granted' }),
  setAudioModeAsync: async () => undefined,
  AudioQuality: { MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ exists: true, size: 160_000, delete: () => undefined })),
}));

const mockIdentify = jest.fn<Promise<IdentifyOutcome>, unknown[]>();
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  hasApiBaseUrl: () => true,
  identify: (...args: unknown[]) => mockIdentify(...args),
}));

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  history: HistoryScreen,
  result: ResultScreen,
};

beforeEach(async () => {
  await historyStore.clear(); // clears AsyncStorage and the store's in-memory cache
  mockIdentify.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Drive the (shortened) capture + upload. renderRouter() installs jest fake timers, so time
 * only moves when we advance it inside act().
 */
async function runRecognition() {
  await fireEvent.press(await screen.findByTestId('identify-button'));
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
  }
}

describe('screens', () => {
  it('Home shows the identify button, catalog note and the dev-only tools', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Tap to identify')).toBeTruthy();
    expect(screen.getByText('Identify music')).toBeTruthy();
    expect(screen.getByText(/songs in our catalog/)).toBeTruthy();
    expect(screen.getByText(/DEVELOPER TOOLS/)).toBeTruthy();
    expect(screen.getByText('Identify from file…')).toBeTruthy();
  });

  it('full mic flow against a model-unavailable backend shows the model-unavailable error', async () => {
    mockIdentify.mockResolvedValue({
      type: 'error',
      error: {
        kind: 'model_unavailable',
        code: 'provider_not_configured',
        message: 'No recognition provider is configured on this server',
        requestId: 'req_503',
        httpStatus: 503,
        query: QUERY_BLOCK,
      },
    });
    await renderRouter(routes, { initialUrl: '/' });
    await runRecognition();
    expect(screen.getByText('Recognition model unavailable')).toBeTruthy();
    expect(mockIdentify).toHaveBeenCalledWith(
      'file:///cache/ExpoAudio/recording-screen.m4a',
      expect.objectContaining({ source: 'microphone' }),
    );
    expect(screen.getByTestId('error-action-retry')).toBeTruthy();
    expect(screen.getByText(/http=503/)).toBeTruthy();
    expect(screen.getByText(/Server decoded: aac · 44100 Hz · 1 ch/)).toBeTruthy();
    expect(screen.queryByTestId('cancel-button')).toBeNull();
  });

  it('a match opens the result screen and is saved to history', async () => {
    mockIdentify.mockResolvedValue({ type: 'matched', response: matchedBody() });
    const router = await renderRouter(routes, { initialUrl: '/' });
    await runRecognition();
    expect(router.getPathname()).toBe('/result');
    expect(await screen.findByTestId('result-title')).toHaveTextContent('Example Song');
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
      expect(raw && JSON.parse(raw).entries).toHaveLength(1);
    });
  });

  it('no_match stays on Home with friendly copy', async () => {
    mockIdentify.mockResolvedValue({
      type: 'no_match',
      response: { ...errorBody('no_match', 'x'), error: null, provider: 'neural', provider_kind: 'self_hosted_model' },
    });
    const router = await renderRouter(routes, { initialUrl: '/' });
    await runRecognition();
    expect(screen.getByText('No match found')).toBeTruthy();
    expect(router.getPathname()).toBe('/');
    expect(screen.getByText('Tap to try again')).toBeTruthy();
  });

  it('History lists stored matches and reopens a result', async () => {
    const entry = makeHistoryEntry(matchedBody(), 'microphone', new Date('2026-10-17T20:00:00Z'));
    await historyStore.add(entry);
    const router = await renderRouter(routes, { initialUrl: '/history' });

    await fireEvent.press(await screen.findByText('Example Song'));
    await waitFor(() => expect(router.getPathname()).toBe('/result'));
    expect(await screen.findByTestId('result-artist')).toHaveTextContent('Example Artist');
  });

  it('History shows the empty state', async () => {
    await renderRouter(routes, { initialUrl: '/history' });
    expect(await screen.findByText('Songs you identify will appear here.')).toBeTruthy();
  });
});
