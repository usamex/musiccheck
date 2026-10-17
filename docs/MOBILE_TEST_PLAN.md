# Mobile App Manual Test Plan

Scope: `apps/mobile` (Expo SDK 58, expo-router, expo-audio). This plan covers what automated
tests **cannot** prove: that the real microphone records, that audio really reaches the
backend, and that results/errors render correctly on real hardware.

**Status: nothing in this plan has been executed yet.** Every result cell is `PENDING`.
Physical-device and simulator/emulator results are recorded in **separate columns** and must
never be merged: a simulator pass is not a device pass.

What is verified automatically today (no device): TypeScript strict typecheck; jest unit
tests (136 when this plan was written: state machine, API mapping with a mocked `fetch`,
history store, copy/formatting, result-screen render, recognizer orchestration with mocked
expo-audio); `expo-doctor`; Metro bundle export for Android and iOS. Mocked tests prove
control flow and contract mapping only. See `apps/mobile/README.md`.

## 0. Test session record

Fill one block per session.

| Field | Value |
|---|---|
| Date / tester | |
| App commit (`git rev-parse --short HEAD`) | |
| Backend commit + `MUSICCHECK_RECOGNITION_PROVIDER` | |
| `GET /ready` output (provider, catalog checks) | |
| Runtime (Expo Go version / dev build / release build) | |
| Physical device(s): model + OS version | |
| Simulator/emulator(s): name + OS version | |
| Network (same Wi-Fi? LAN IP used in `EXPO_PUBLIC_API_BASE_URL`) | |

## 1. Preconditions

1. Backend running on the LAN: `services/api` listening on `0.0.0.0:8000`; firewall allows 8000.
2. `apps/mobile/.env` → `EXPO_PUBLIC_API_BASE_URL=http://<LAN IP>:8000` (emulator: `http://10.0.2.2:8000`).
3. `cd apps/mobile && npx expo start --clear`; open in Expo Go (SDK 58) or a dev build.
4. Tail the backend log to correlate requests: every identify request logs
   `identify request_id=… status=… http=… source=…`. The app's developer panel shows the same
   `request_id` under errors.
5. Simulator/emulator microphone: iOS Simulator uses the Mac's input device; Android Emulator
   needs *Extended controls → Microphone → "Virtual microphone uses host audio input"* enabled.
6. A speaker playing music near the phone (≈ 30–100 cm, normal listening volume).

**Recognition model status:** the model is not ready yet, so the backend currently answers
every valid recording with HTTP 503 `status: "provider_unavailable"`. Cases marked
**[needs model]** (match, no-match, history) are blocked until a provider is ready and the
catalog is indexed; run them as soon as `GET /ready` reports `recognition.ok` and
`catalog.ok`. Everything else can be run today.

Result legend: `PASS`, `FAIL (<short note / issue link>)`, `BLOCKED (<reason>)`, `N/A`.

## 2. Connectivity

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| ENV-1 | Home → Developer tools → **Check server**. | `OK: musiccheck-api <version> at http://<LAN IP>:8000`. | PENDING | PENDING |
| ENV-2 | Set `EXPO_PUBLIC_API_BASE_URL` to an unused IP, restart Metro with `--clear`, **Check server**. | `Failed (network_unavailable…)` or `Failed (request_timeout…)` within ~5 s; app stays responsive. | PENDING | PENDING |
| ENV-3 | Remove `EXPO_PUBLIC_API_BASE_URL`, restart with `--clear`, tap **Tap to identify**. | Immediately (no permission prompt, no recording): "App not configured" with only a Dismiss action; no request in backend log. | PENDING | PENDING |

## 3. Microphone permission

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| PERM-1 | Fresh install (or reset permissions). Tap **Tap to identify**. | OS microphone prompt appears (dev build text: "MusicCheck uses the microphone to record a short clip…"; Expo Go shows its own text). Status shows "Waiting for microphone permission…". | PENDING | PENDING |
| PERM-2 | At the prompt choose **Allow**. | Listening starts immediately: pulsing ring, red dot, "Recording 0s / 10s" counting up. | PENDING | PENDING |
| PERM-3 | Reset permission, tap identify, choose **Don't allow** (first denial). | Error "Microphone access needed". Android (can ask again): **Try again** + **Open Settings**. iOS: **Open Settings** + Dismiss. No recording indicator, no request in backend log. | PENDING | PENDING |
| PERM-4 | Deny permanently (Android: deny twice / "Don't ask again"; iOS: already permanent after one denial). Tap identify again. | No OS prompt; the same error with **Open Settings** as the primary action. **Open Settings** opens this app's settings page. | PENDING | PENDING |
| PERM-5 | From PERM-4, enable the microphone in Settings, switch back to the app, tap identify. | Recording starts without restarting the app. | PENDING | PENDING |
| PERM-6 | With permission granted, background the app, revoke microphone in Settings, return, tap identify. (iOS may restart the app when a permission is revoked — note it.) | Android: prompt again or permission error. iOS: permission error with Open Settings. Never a crash or stuck LISTENING. | PENDING | PENDING |

## 4. Audio capture and recording format

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| CAP-1 | Play music near the phone, tap identify, watch the screen and OS status bar. | Pulsing ring; "Recording Ns / 10s" increments about once per second; the OS microphone indicator (iOS orange dot / Android privacy chip) is visible **only** during capture. | PENDING | PENDING |
| CAP-2 | Let the capture run to the end. | Auto-stop at 10 s → "Identifying…" with spinner and **Cancel**; the mic indicator turns off; exactly one identify request in the backend log with `source=microphone`. | PENDING | PENDING |
| CAP-3 | **Format verification.** Complete CAP-2 against today's backend (503 model unavailable). Read the developer diagnostics under the error ("Server decoded: …") and the response `query` block (or backend log). | `codec` = `aac`, `sample_rate` = `44100`, `channels` = `1`, `duration_seconds` ≈ 9.5–10.5, `container` contains `mp4`/`m4a`. Record the exact values per device; any other value is a FAIL to investigate (e.g. device-forced resampling). | PENDING | PENDING |
| CAP-4 | Cover the microphone / record in a silent room. | Error "We couldn't hear anything" (`invalid_recording`, code `audio_silent`, HTTP 422) with **Try again**. (Silence is rejected before the provider check, so this works today.) | PENDING | PENDING |
| CAP-5 | iOS only: ringer/silent switch ON, tap identify. | Recording works normally (audio mode `playsInSilentMode`). | PENDING | PENDING |
| CAP-6 | Play music from another app on the **same phone** (speaker), then tap identify. | The other app keeps playing (audio session `mixWithOthers`) and the recording contains it (CAP-3 diagnostics show a non-silent recording). | PENDING | PENDING |
| CAP-7 | Start a voice call or a recording in another app, then tap identify in MusicCheck. | Either recording works or "Microphone unavailable" with **Try again**. Never stuck in LISTENING for more than 15 s. | PENDING | PENDING |
| CAP-8 | During LISTENING press Home (background the app) for 3 s, then return. | Capture was cancelled: Home shows the idle state; no identify request in the backend log. | PENDING | PENDING |

## 5. Upload and server outcomes

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| UP-1 | **Model unavailable (expected today).** Backend with no provider (`MUSICCHECK_RECOGNITION_PROVIDER=none` / unset). Record 10 s of music. | Error "Recognition model unavailable" with copy explaining the server has no engine yet and **Try again**. Developer diagnostics: `kind=model_unavailable`, `code=provider_not_configured` (or `provider_not_ready` / `catalog_empty`), `http=503`, `request_id=…` matching the backend log. | PENDING | PENDING |
| UP-2 | **[needs model]** Play a catalog track, record. | Result screen opens automatically: title, artist, album (if any), artwork or a ♪ placeholder, "Identified by MusicCheck model" (or "Identified via <provider>" for an external service), matched offset if present. | PENDING | PENDING |
| UP-3 | **[needs model]** Inspect the result details of UP-2. | `Confidence: NN%` appears **only** if the API returned a non-null `confidence`. The score appears only as "Details: Similarity score 0.xxx (raw, not a probability)" — never as a percentage. | PENDING | PENDING |
| UP-4 | **[needs model]** Tap **Identify another** on the result screen. | Returns to Home; tapping the main button starts a new recording. | PENDING | PENDING |
| UP-5 | **[needs model]** Play music that is NOT in the catalog. | "No match found" state with friendly copy; main button reads "Tap to try again"; no history entry. | PENDING | PENDING |
| UP-6 | Developer tools → **Identify from file…**, pick an `.m4a` or `.mp3`. | Same pipeline: "Identifying…" → outcome (today: model unavailable). Backend log shows `source=file`. | PENDING | PENDING |
| UP-7 | Developer tools → **Identify from file…**, pick a non-audio file (e.g. a PDF/image if the picker allows, or a renamed text file). | "Unsupported audio format" (415) or a recording-problem error (422 `invalid_audio`); app stays usable. | PENDING | PENDING |
| UP-8 | Production JS (`npx expo start --no-dev --minify`). Open Home. | No "Developer tools" box; errors show only "Reference: req_…" instead of full diagnostics. | PENDING | PENDING |

## 6. Network errors

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| NET-1 | Stop the backend process. Record 10 s. | "No connection" (`network_unavailable`) with **Try again**, shortly after the capture ends. Start the backend, **Try again** → reaches the server (UP-1 result). | PENDING | PENDING |
| NET-2 | Airplane mode ON (Wi-Fi off). Record 10 s. | "No connection" with **Try again**; app responsive. | PENDING | PENDING |
| NET-3 | Backend reachable but frozen: `kill -STOP <api pid>`. Record 10 s. | "Identifying…" with **Cancel** for up to 30 s, then "Request timed out" (`request_timeout`). Resume with `kill -CONT`. | PENDING | PENDING |
| NET-4 | Point the app at a proxy/port that returns an HTML error page (or a wrong service on port 8000). | "Service unavailable" (`backend_unavailable`, code `invalid_response`); no crash. | PENDING | PENDING |

## 7. Cancellation and timeouts

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| CAN-1 | Tap identify, press **Cancel** at ~3 s. | Immediately back to idle; mic indicator off; no identify request in the backend log. | PENDING | PENDING |
| CAN-2 | Make processing slow (NET-3 frozen backend), record, press **Cancel** while "Identifying…". | Immediately idle. After `kill -CONT` the late server response is ignored (no screen change, no history entry). | PENDING | PENDING |
| CAN-3 | Tap identify → Cancel → identify → Cancel … 5× quickly, then let one run to completion. | No crash, no stuck state, the final recording uploads normally (CAP-2/CAP-3 hold). | PENDING | PENDING |
| TO-1 | Same as NET-3; time it. | Processing never exceeds ~30 s (client timeout); LISTENING never exceeds 15 s (safety timeout). | PENDING | PENDING |

## 8. History

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| HIS-1 | **[needs model]** Get 2–3 matches, open **History** (header button on Home). | Matched songs only, newest first, each with title, artist, timestamp. Errors / no-matches are absent. | PENDING | PENDING |
| HIS-2 | **[needs model]** Tap a history entry. | The result screen re-opens with the same details as when it was identified. | PENDING | PENDING |
| HIS-3 | **[needs model]** Force-quit the app (swipe away) and relaunch; open History. | Same entries, same order (persisted in AsyncStorage). | PENDING | PENDING |
| HIS-4 | **[needs model]** History → **Clear** → **Cancel**; then **Clear** → **Clear**. | Cancel keeps entries; confirming empties the list ("Songs you identify will appear here."). Still empty after relaunch. | PENDING | PENDING |
| HIS-5 | Fresh install, open History. | Empty-state text; no Clear button. | PENDING | PENDING |

## 9. Appearance and accessibility (quick pass)

| ID | Steps | Expected result | Simulator/emulator result | Physical device result |
|---|---|---|---|---|
| UI-1 | Toggle system light/dark mode with the app open on each screen. | Colors, header and status bar follow the system theme; text stays readable. | PENDING | PENDING |
| UI-2 | Look at Home. | The note "Recognizes songs in our catalog — not every song ever recorded." is visible. | PENDING | PENDING |
| UI-3 | Set the largest system font size; walk through Home, Result, History. | No clipped primary actions; main button text remains readable. | PENDING | PENDING |
| UI-4 | Screen reader (VoiceOver / TalkBack) on Home. | Main button announced with its label ("Tap to identify"); status changes are announced. | PENDING | PENDING |

## 10. Reporting

- Record failures with the `request_id`, device/OS, and the developer diagnostics text.
- Copy confirmed device facts (e.g. CAP-3 format values per device) into `FINDINGS.md`.
- Re-run UP-2…UP-5 and HIS-1…HIS-4 as soon as a recognition provider is ready.
