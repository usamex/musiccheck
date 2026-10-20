# Findings

Engineering knowledge that should survive the session. **V** = verified by us (with evidence
reference), **H** = hypothesis / reported but not checked. Never delete; mark superseded.

## Environment

- **F-001 (V, IT-001)** The original dev machine (Linux, work computer) has no Node.js. Docker
  29.7 + Compose v5.4, FFmpeg 7.1.1, uv 0.12.21, Python 3.13 system / 3.12 via uv.
  `scripts/node-docker.sh` runs npm/npx in `node:24-bookworm-slim` as the host user with host
  networking (named volume `musiccheck-node-home` for the npm cache).
- **F-002 (V, IT-001)** Latest Expo on 2026-10-17: `expo@58.0.14` (SDK 58), `expo-audio@58.0.9`,
  `expo-router@58.0.23`, `jest-expo@58.0.11` (from `npm view`).
- **F-003 (V, IT-001)** Latest GitHub Action majors on 2026-10-17: `actions/checkout@v7`,
  `actions/setup-node@v7`, `astral-sh/setup-uv@v7` (from `git ls-remote --tags`).

## Backend / audio pipeline

- **F-004 (V, IT-001)** FastAPI 0.143 re-raises Starlette `HTTPException` from body parsing but
  converts any other exception to a generic 400. The streaming body-size limit therefore raises
  a `StarletteHTTPException` subclass (`BodyTooLarge`) so it surfaces as 413.
- **F-005 (V, IT-001)** Starlette 1.8's TestClient deprecates `httpx` in favour of `httpx2`
  (Starlette itself imports `httpx2`). Dev dependency is `httpx2`.
- **F-006 (V, IT-001)** SQLite drops tzinfo on read; `db.UTCDateTime` normalises to aware UTC on
  both backends (caught by a test comparing POST vs GET bodies).
- **F-007 (V, IT-001)** `StubProvider` (services/api/tests) is a test double: passing tests that
  use it prove response plumbing, catalog bookkeeping and error paths — **not** recognition.
- **F-008 (V, IT-001)** FFmpeg-generated AAC/m4a of 6.0 s decodes to 6.014 s (AAC priming
  samples); duration checks must allow small tolerance.
- **F-009 (V, IT-001; behaviour superseded by F-017 in IT-003)** A truncated m4a (first 2 KiB,
  missing `moov`) and an empty file fail at probe time. Originally both → 415; since IT-003 the
  truncated m4a → 422 `invalid_audio` (empty uploads are 400 `empty_audio` before probing).
- **F-010 (V, IT-001)** Phone-like recordings (AAC-LC mono 44.1 kHz in MPEG-4) pass through the
  compose stack: `query` reports `codec=aac, sample_rate=44100, channels=1`.
- **F-011 (H)** −60 dBFS RMS is a guess for the silence gate; generated pink-noise "music" sits
  above −30 dBFS and digital silence at −200 dBFS. Real quiet-room phone noise floors need
  measuring (QA-3).

- **F-012 (V, IT-003)** Starlette's TestClient sends the whole request body in one ASGI message,
  so in-process tests cannot prove incremental body cut-off. Verified instead against uvicorn in
  the compose stack: a 12 MB `Transfer-Encoding: chunked` upload to identify → 413 (after
  `100 Continue`) with one `X-Request-ID` and the full RecognitionResponse shape.
- **F-013 (V, IT-003)** Starlette runs app-level `Exception` handlers in ServerErrorMiddleware,
  *outside* user middleware, so their 500s lacked `X-Request-ID`. Unhandled errors are now
  caught in `RequestIdMiddleware` (outermost user middleware).
- **F-014 (V, IT-003)** FFmpeg stderr contains absolute temp paths and heap addresses; returning
  it to clients leaked server internals. `AudioError.detail` now carries it to logs only.
- **F-015 (V, IT-003, review)** SQLite silently accepts strings longer than `String(500)`;
  PostgreSQL raises `StringDataRightTruncation`. Truncate user/tag metadata explicitly and run the
  suite on PostgreSQL (CI does).
- **F-016 (V, IT-003, review)** A 744 KB 20-minute Opus reference decodes to ~220 MB peak RSS
  (PCM + copies). Admin-only today; streaming decode is BE-13.
- **F-017 (V, IT-003)** Distinguishing "corrupt allowed container" (422) from "unsupported
  format" (415) uses a magic-byte sniff (`audio.looks_like_allowed_container`), because ffprobe
  fails the same way ("Invalid data found…") for both.

## Mobile (Expo SDK 58)

- **F-018 (V, IT-002, source + Expo's own tests; not yet on device)** In SDK 58 the global
  `fetch` on iOS/Android is `expo/fetch`; its multipart encoder rejects RN's legacy
  `{uri, name, type}` FormData part ("Unsupported FormDataPart implementation",
  `node_modules/expo/src/winter/fetch/convertFormData.ts`). Upload an `expo-file-system` `File`
  instead. Consequences: multipart filename is the recording's basename (`<uuid>.m4a`), and
  network failures throw `FetchError`, not `TypeError`.
- **F-019 (V, IT-002, type defs + native sources)** `RecordingPresets.HIGH_QUALITY` is stereo;
  the app sets explicit options (AAC/.m4a, mono, 44.1 kHz, 128 kbps; Android source `mic`).
  Real-device format still to confirm via the server's `query` block (MOBILE_TEST_PLAN CAP-3).
- **F-020 (V, IT-002)** expo-audio needs `expo-asset` as a peer (expo-doctor). The blank
  template needs an explicit `react-dom@19.3.0`, otherwise npm pulls 19.3.1 via expo-router's
  radix dependency and later installs fail.
- **F-021 (V, IT-002)** TypeScript 6 no longer auto-loads `@types` → `"types": ["jest"]` in
  tsconfig. RNTL 14 `render`/`renderHook`/`fireEvent` are async. Overriding
  `transformIgnorePatterns` breaks expo-router tests; keep the jest-expo preset default.
- **F-022 (V, IT-002/IT-004)** Expo CLI tools inside `scripts/node-docker.sh` need a non-empty
  `CI` (`CI=1`), else `GetEnv.NoBoolean`. jest-expo replaces `fetch` with a mock even under
  `@jest-environment node`, so live-backend checks run in plain Node (`npm run contract:check`).
- **F-023 (V, IT-002)** `npm audit` reports 47 moderate/high advisories, all in Expo CLI / Metro /
  Jest tooling pinned by SDK 58 (mobile agent's analysis, not independently re-checked). Revisit on SDK bump.
  Update 2026-10-20 (IT-010): 55 (25 moderate, 30 high, 0 critical), identical before and after
  the SDK 58 patch update; the increase since IT-002 comes from later dependencies and newly
  published advisories.

- **F-024 (V on web only, IT-005)** In the web preview the header-right `Pressable`s
  ("History", "Clear") end exactly at the viewport edge (bounding rect right = 375 of 375). Native
  stack headers add their own insets, so this is likely web-only — unverified on device (MOB-7).

- **F-025 (V, IT-007)** `@expo/vector-icons` requires `expo-font` as a directly installed peer
  (expo-doctor: "may crash outside of Expo Go"). Under Jest it fails with "Module … is missing from
  the asset registry"; `apps/mobile/test/setup.tsx` mocks the icon sets as Text placeholders.
- **F-026 (V, IT-007, web)** expo-router `<Link asChild>` injects its own `style` into the child on
  web; spreading props *after* our `style` dropped the button's inset. `IconButton` spreads first.
  With that, the header icon sits 8 px from the edge (bounding rect right = 367 of 375) — resolves
  F-024 on web; device check pending (MOB-7).
- **F-027 (V, IT-007)** An always-running `Animated.loop` on the idle screen made RNTL report
  "overlapping act() calls" and failed later navigation tests. Idle visuals are static; loops run
  only while listening.
- **F-028 (V, IT-007)** Gemini dark tokens read from gemini.google.com's computed
  `--gem-sys-color--*` variables (2026-10-18); the stylesheet's first occurrences are the *light*
  values — read computed values on a `dark-theme` page. Token table in ADR-0006.

- **F-033 (V from docs + config introspection, IT-009; not on device)** Installed-app detection
  for "Listen on": `Linking.canOpenURL` needs iOS `LSApplicationQueriesSchemes` (app.json
  `ios.infoPlist`) and Android 11+ `<queries>` (expo-build-properties `android.manifestQueries`).
  Detectable: Spotify (`spotify:` iOS + Android), Apple Music (`music:` iOS only). YouTube Music
  has no documented scheme on either platform, Apple Music none on Android → shown as "unknown".
  Expo docs: this configuration "cannot be tested with Expo Go" → the app reports all as unknown
  there (`isRunningInExpoGo()`). Note `Constants.executionEnvironment === 'storeClient'` also
  covers dev-client builds, so it cannot identify Expo Go. All three https search URLs
  (open.spotify.com/search, music.youtube.com/search, music.apple.com/search) returned 200.
- **F-034 (V, IT-009)** In this shell, `git add <paths> && git commit` produced a commit with
  *every* changed and untracked file (the command proxy rewrites git invocations). Calling
  `/usr/bin/git` directly respected the paths. Check `git show --stat HEAD` after committing.
- **F-035 (V, IT-009)** Expo released SDK 58 patch versions after 2026-10-18; `expo-doctor` now
  reports 19/20 (patch mismatches: expo 58.0.16, expo-asset, expo-file-system, expo-font,
  expo-router). Not caused by our changes; update in its own commit (MOB-10).
  **Resolved IT-010:** `npx expo install --fix` → expo 58.0.16, expo-asset 58.0.17,
  expo-file-system 58.0.10, expo-font 58.0.9, expo-router 58.0.24; expo-doctor 20/20.

## Recognition (no experiments yet)

- **H-001 (H → confirmed from literature, IT-008)** NMFP / NAFP embed 1 s segments with a 0.5 s
  hop; retrieval is FAISS top-k per segment + offset-aligned score aggregation, not a single
  nearest neighbour (arXiv 2010.11910, 2506.22661). Still to confirm in code during ML-3.
- **H-002 (superseded by F-029)** "NMFP is AGPLv3" — the sources disagree, see F-029.
- **F-029 (V, IT-008)** NMFP licence is inconsistent: README says code + weights are AGPLv3; the
  `LICENSE` file is plain GPLv3 (GitHub API `GPL-3.0`); Zenodo record 15719945 lists the weights
  as GPL-3.0-or-later. A WebFetch page summary wrongly reported the LICENSE file as AGPL — read
  raw files/APIs for licence questions. Needs written clarification from the authors (ML-1b).
- **F-030 (V, IT-008)** Downloadable weights exist for NMFP (Zenodo 15719945: nmfp-triplet.zip
  172,872,470 B, md5 ee8a3358fc5e5cdd09d6d2245d395021) and the Pretrained Conformers (Zenodo
  16902363, CC-BY-4.0: 6.1 / 35.3 / 104.9 MB). GraFPrint weights (HF chymaera96/grafp_db) have
  no licence. No usable official NAFP (mimbres) weights were found.
- **F-031 (R, IT-008)** Only NMFP reports real phone/room results: 63.9 / 75.0 / 82.0 / 84.6 %
  top-1 at 1 / 2 / 5 / 10 s (3,692 captures, ~95k-track DB), vs 95.6 % synthetic at 10 s.
  Synthetic benchmarks overstate real-world accuracy (two independent papers) → decide on our
  own device recordings (EXP-001). No source measures false accepts on unknown tracks.
- **F-032 (R, IT-008)** Raw tagging/semantic embeddings (CLAP, MusicFM, raw MERT/MuQ) are not
  evidenced as exact-recording identifiers; foundation-model fingerprinters always add a
  contrastively trained head. Full write-up: docs/MODEL_RESEARCH.md.
