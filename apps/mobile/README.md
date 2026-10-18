# MusicCheck mobile app

Expo (SDK 58) + TypeScript (strict) + expo-router. Tap to record ~10 s from the microphone,
upload it to the MusicCheck API (`POST /v1/recognition/identify`, see `docs/API.md`), and
show the match. Matched results are kept in a local history.

Status: typecheck, unit tests, `expo-doctor` and Android/iOS JS bundle exports pass (run in
the repo's Node 24 Docker container). **Nothing here has been verified on a phone, simulator
or emulator yet** — follow `docs/MOBILE_TEST_PLAN.md`.

## Layout

```
src/app/            expo-router screens: index (Home), result, history, _layout
src/api/            types.ts (wire contract mirror), parse.ts (runtime validation),
                    client.ts (identify / getHealth), config.ts (base URL, timeouts)
src/recognition/    machine.ts (pure state machine), useRecognition.ts (recorder + upload
                    orchestration), recordingConfig.ts (format + timing), audioSession.ts,
                    errors.ts (ErrorKind)
src/history/        historyStore.ts (validated AsyncStorage persistence, cap 200)
src/presentation/   copy.ts (user-facing copy and formatting)
src/components/     IdentifyButton, ResultView, ActionButton, DevTools (__DEV__ only)
src/theme/          light/dark palette (follows the system setting)
test/               jest-expo unit tests + test-only fixtures
```

## Setup

Requires Node 20+ (the repo pins Node 24 via Docker, see below).

```bash
cd apps/mobile
npm ci
cp .env.example .env      # then edit EXPO_PUBLIC_API_BASE_URL
```

### Pointing the app at the backend

`EXPO_PUBLIC_API_BASE_URL` must be reachable **from the phone**:

| Where the app runs | Value |
|---|---|
| Physical phone (Expo Go or dev build) | `http://<LAN IP of the computer running services/api>:8000`, e.g. `http://192.168.1.23:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator on the same Mac | `http://localhost:8000` |

- `localhost` / `127.0.0.1` will **not** work from a physical phone — that is the phone itself.
- Phone and computer must be on the **same Wi-Fi** (guest networks / client isolation block this).
- Find the LAN IP with `ip -4 addr` (Linux), `ipconfig getifaddr en0` (macOS) or `ipconfig` (Windows).
- The API must listen on `0.0.0.0`, not only `127.0.0.1`, and the host firewall must allow port 8000.
- `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time: never put secrets there,
  and restart `npx expo start` (ideally with `--clear`) after changing `.env`.
- In development builds, Home shows a **Developer tools** box with the configured URL and a
  "Check server" button that calls `GET /health`.

## Run

```bash
npx expo start            # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

All native modules used (expo-audio, expo-file-system, expo-document-picker, AsyncStorage,
expo-router, expo-asset) are SDK 58 bundled modules (`expo/bundledNativeModules.json`), so
Expo Go for SDK 58 should run the app without a custom native build (not yet confirmed on a
device).

### Without Node on the host (Docker wrapper)

From the repo root:

```bash
scripts/node-docker.sh apps/mobile npm ci
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:8000 scripts/node-docker.sh apps/mobile npx expo start
```

The wrapper uses host networking, so Metro (port 8081) is reachable from the phone on the LAN.
It forwards `EXPO_PUBLIC_API_BASE_URL` and `CI` from your shell; `.env` in `apps/mobile` is
read as usual. Use `CI=1` for non-interactive commands (`expo-doctor`, `expo export`) — an
empty `CI` makes some Expo tools fail with `GetEnv.NoBoolean`.

## Checks

```bash
npm run typecheck         # tsc --noEmit (strict, includes tests)
npm test                  # jest-expo, non-watch (--ci)
npm run doctor            # npx expo-doctor
npm run export:check      # expo export for android + ios into /tmp (proves Metro bundles)
npm run contract:check -- http://127.0.0.1:8000   # real API client vs. a running backend
```

`contract:check` compiles `src/api/client.ts` with `tsc` and runs it in plain Node against a
live backend (`docker compose up` first): health, model-unavailable, silence, too-short,
not-audio, unreachable server, user cancel. Node's `fetch` replaces `expo/fetch` there (jest-expo
mocks `fetch` even in the node test environment), so it checks request shape and response
mapping, not the native upload path.

There is no `lint` script: the blank-typescript template ships no ESLint config, and
`npx expo lint` would scaffold one (left for a follow-up).

Unit tests use test doubles for fetch, expo-audio, expo-file-system and storage. They prove
state handling and contract mapping, **not** that the microphone records on a device.

## Design

Dark-only theme based on the Gemini app's dark palette (ADR-0006): tokens in
`src/theme/theme.ts`, the blue → purple → pink gradient via `expo-linear-gradient`, Material icons
via `@expo/vector-icons` (+ `expo-font`). Jest renders icons as text placeholders
(`test/setup.tsx`), so icon appearance is only checked visually.

## Recording format

Defined explicitly in `src/recognition/recordingConfig.ts` (not via a preset):

| | Value |
|---|---|
| Codec / container | AAC-LC in MPEG-4 (`.m4a`) — Android `MediaRecorder` `mpeg4`/`aac`; iOS `AVAudioRecorder` `kAudioFormatMPEG4AAC` |
| Sample rate | 44 100 Hz |
| Channels | 1 (mono) |
| Bit rate | 128 kbit/s (iOS quality MAX) |
| Android source | `mic` (no voice-call processing) |
| Capture window | 10 s (`CAPTURE_DURATION_MS`), auto-stop; hard safety timeout 15 s |
| Storage | app cache dir; file deleted after upload, cancel or failure |

The backend reports what it decoded in the response `query` block (codec / sample_rate /
channels). Developer builds print it under errors and on the result screen
("Server decoded: aac · 44100 Hz · 1 ch · …") — use it to verify real-device recordings.

### Upload mechanics (SDK 58 specific)

In SDK 58 the global `fetch` on iOS/Android **is `expo/fetch`**, and its multipart encoder
rejects React Native's legacy `{ uri, name, type }` FormData object ("Unsupported
FormDataPart implementation"). The app therefore appends an `expo-file-system` `File` for the
`audio` field (the documented SDK 58 approach). Consequence: the multipart filename is the
recording's own name (e.g. `recording-<uuid>.m4a` on iOS, `<uuid>.m4a` on Android) and the
part content type is the OS's MIME type for `.m4a`. The backend only uses the filename
extension and probes the content with FFmpeg, so this is compatible with `docs/API.md`.
Setting `EXPO_PUBLIC_USE_RN_FETCH=1` would switch the global back to React Native's fetch;
the app does not rely on that.

## Cleartext HTTP (http:// to a LAN IP)

- **Expo Go:** plain `http://` to a LAN IP is expected to work on Android and iOS (Expo Go
  itself loads the JS bundle from Metro over LAN HTTP).
- **Android development builds:** the debug variant generated by `npx expo prebuild` allows
  cleartext traffic (check `android/app/src/debug/AndroidManifest.xml` after prebuild);
  **release builds block it** unless you add `expo-build-properties` with
  `android.usesCleartextTraffic: true` (internal testing only) — production should use HTTPS.
- **iOS development builds:** App Transport Security applies. `npx expo config --type
  introspect` currently resolves `NSAllowsArbitraryLoads: true` from Expo's template, so LAN
  HTTP should work; tighten this before any release. iOS 14+ may also show a "local network"
  permission prompt the first time the app connects to a LAN address.

## Error states

`ErrorKind` (`src/recognition/errors.ts`) → user copy (`src/presentation/copy.ts`):
`mic_permission_denied` (Open Settings), `mic_unavailable`, `network_unavailable`,
`backend_unavailable`, `unsupported_audio_format`, `invalid_recording` (copy chosen by the
server's `error.code`, e.g. `audio_silent` → "We couldn't hear anything"),
`model_unavailable` (HTTP 503 `provider_unavailable` — **the expected answer until a
recognition model is deployed**), `request_timeout` (30 s client timeout), `unknown`.
"No match" is a separate, non-error state.
