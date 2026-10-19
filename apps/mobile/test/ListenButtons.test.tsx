import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { ListenButtons } from '../src/components/ListenButtons';
import { PREFERRED_SERVICE_KEY } from '../src/listen/useListenServices';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockInExpoGo = jest.fn(() => false);
jest.mock('expo', () => ({ isRunningInExpoGo: () => mockInExpoGo() }));

const shownIds = () =>
  screen.getAllByRole('link').map((el) => String(el.props.testID).replace('listen-', ''));

beforeEach(async () => {
  // RN's Jest setup defines Linking.* as jest.fn; spyOn returns that same mock, so call
  // history would otherwise leak between tests.
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockInExpoGo.mockReturnValue(false);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

// jest-expo runs these tests as iOS, so Spotify (spotify:) and Apple Music (music:) are probed.
it('hides apps that are confirmed missing and lists installed apps first', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockImplementation(async (url) => url === 'music:');
  await render(<ListenButtons title="Get Lucky" artist="Daft Punk" />);
  await waitFor(() => expect(shownIds()).toEqual(['apple_music', 'youtube_music']));
});

it('shows every service in Expo Go, where detection is impossible', async () => {
  mockInExpoGo.mockReturnValue(true);
  const canOpenURL = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  await render(<ListenButtons title="Get Lucky" artist="Daft Punk" />);
  await waitFor(() => expect(shownIds()).toEqual(['spotify', 'youtube_music', 'apple_music']));
  expect(canOpenURL).not.toHaveBeenCalled();
});

it('opens a search link and remembers the chosen service', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  await render(<ListenButtons title="Get Lucky" artist="Daft Punk" />);
  await fireEvent.press(await screen.findByTestId('listen-youtube_music'));
  expect(Linking.openURL).toHaveBeenCalledWith(
    'https://music.youtube.com/search?q=Get%20Lucky%20Daft%20Punk',
  );
  await waitFor(async () =>
    expect(await AsyncStorage.getItem(PREFERRED_SERVICE_KEY)).toBe('youtube_music'),
  );
  await waitFor(() => expect(shownIds()[0]).toBe('youtube_music'));
});

it('restores the preferred service on the next result', async () => {
  await AsyncStorage.setItem(PREFERRED_SERVICE_KEY, 'apple_music');
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  await render(<ListenButtons title="Song" artist="Artist" />);
  await waitFor(() => expect(shownIds()[0]).toBe('apple_music'));
});

it('says so when a link cannot be opened', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
  await render(<ListenButtons title="Song" artist="Artist" />);
  await fireEvent.press(await screen.findByTestId('listen-spotify'));
  expect(await screen.findByText("Couldn't open Spotify.")).toBeTruthy();
});
