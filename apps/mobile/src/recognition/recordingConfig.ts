/**
 * Microphone capture configuration.
 *
 * Format: AAC-LC, mono, 44.1 kHz, ~128 kbit/s, in an MPEG-4 (.m4a) container on both
 * platforms. Every field is set explicitly instead of relying on `RecordingPresets`
 * (HIGH_QUALITY is stereo; LOW_QUALITY is AMR-NB/3GP on Android).
 *
 * - Android → MediaRecorder: OutputFormat.MPEG_4 + AudioEncoder.AAC, AudioSource.MIC
 *   (plain microphone; `voice_communication`/`voice_recognition` apply speech processing
 *   that is bad for music).
 * - iOS → AVAudioRecorder: kAudioFormatMPEG4AAC ("aac "), AVEncoderAudioQualityKey = MAX.
 *
 * The backend's `query` block in every response reports what it actually decoded
 * (expected: codec "aac", sample_rate 44100, channels 1) — see docs/MOBILE_TEST_PLAN.md.
 */
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

/** Fixed capture window. Backend requires ≥ 2 s and analyses at most 30 s. */
export const CAPTURE_DURATION_MS = 10_000;
/** How often the elapsed-time display is refreshed while listening. */
export const TICK_INTERVAL_MS = 200;
/**
 * Hard safety net: if we are still LISTENING this long after capture started (e.g. the
 * native recorder never finished preparing), give up with `mic_unavailable`.
 */
export const LISTENING_SAFETY_TIMEOUT_MS = CAPTURE_DURATION_MS + 5_000;
/** Max time to wait for `recorder.stop()` to hand back the file. */
export const STOP_TIMEOUT_MS = 5_000;

export const RECORDING_SAMPLE_RATE = 44_100;
export const RECORDING_CHANNELS = 1;
export const RECORDING_BIT_RATE = 128_000;
export const RECORDING_EXTENSION = '.m4a';

export const RECORDING_OPTIONS: RecordingOptions = {
  extension: RECORDING_EXTENSION,
  sampleRate: RECORDING_SAMPLE_RATE,
  numberOfChannels: RECORDING_CHANNELS,
  bitRate: RECORDING_BIT_RATE,
  isMeteringEnabled: false,
  // Recordings are temporary: written to the cache dir and deleted after upload/cancel.
  directory: 'cache',
  android: {
    extension: RECORDING_EXTENSION,
    sampleRate: RECORDING_SAMPLE_RATE,
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    audioSource: 'mic',
  },
  ios: {
    extension: RECORDING_EXTENSION,
    sampleRate: RECORDING_SAMPLE_RATE,
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
  },
  web: {
    // Web is not a supported target; values present only to satisfy the type.
    mimeType: 'audio/webm',
    bitsPerSecond: RECORDING_BIT_RATE,
  },
};
