/**
 * Thin wrappers around expo-audio permission / audio-session APIs and expo-file-system,
 * so the recognition hook stays readable and every native call is guarded.
 */
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { File } from 'expo-file-system';

export interface MicPermission {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Returns the current microphone permission, prompting the user if it is not granted yet.
 * If the user permanently denied it, the OS returns immediately with `canAskAgain: false`.
 */
export async function ensureMicrophonePermission(): Promise<MicPermission> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: true };
  const requested = await requestRecordingPermissionsAsync();
  return { granted: requested.granted, canAskAgain: requested.canAskAgain };
}

/**
 * iOS needs `allowsRecording: true` (AVAudioSession category playAndRecord) before a
 * recorder can start; `playsInSilentMode: true` keeps that working with the ringer switch
 * off. `mixWithOthers` does not pause music another app is playing on the same phone —
 * which may be exactly the music the user wants identified.
 */
export async function enableRecordingAudioMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
    allowsBackgroundRecording: false,
  });
}

/** Return the audio session to playback-only after capture. Best effort. */
export async function disableRecordingAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync({ allowsRecording: false });
  } catch {
    // Not fatal: the next recording re-enables it anyway.
  }
}

/** Size in bytes of a local file, or null if it does not exist / cannot be read. */
export function localFileSize(uri: string): number | null {
  try {
    const f = new File(uri);
    return f.exists ? f.size : null;
  } catch {
    return null;
  }
}

/** Delete a temporary recording. Never throws. */
export function deleteLocalFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Cache files are also reclaimed by the OS eventually.
  }
}
