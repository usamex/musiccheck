# Iterations

Chronological. Never erase failed experiments; append corrections as new entries.

---

## IT-001 — Monorepo bootstrap + backend vertical slice (no model)

- **Date:** 2026-10-17 (session 1, orchestrator + subagents, Claude Code)
- **Task:** BE-1..BE-6, repo structure, project memory (PROMPT.md Phase 1 + API half of Phase 4).
- **Constraint:** Developer asked not to work on the AI model this session (work computer).
  Phases 2/3/5 (model research, feasibility, real recognition E2E) were therefore not started.
- **Objective:** A real, tested API that accepts phone-format recordings, validates and decodes
  them with FFmpeg, manages a catalog in PostgreSQL, and is honest that no model exists.
- **Changes:** uv workspace; `services/recognition` (interface, audio I/O, registry);
  `services/api` (FastAPI app, middleware, routes, catalog, ORM, Alembic 0001); compose stack +
  Dockerfile; CI workflow; FFmpeg-generated fixtures; docs + ADR-0001..0005; Node-in-Docker
  wrapper.
- **Tests (run):**
  - `uv run pytest -q` → 60 passed (SQLite).
  - Same suite with `MUSICCHECK_TEST_DATABASE_URL=postgresql+psycopg://…@127.0.0.1:5433/musiccheck_test`
    → 60 passed (PostgreSQL 17 in compose).
  - `docker compose up -d --build --wait` → db + api healthy; `uv run pytest tests/integration -v`
    → 5 passed (health, ready=503 with DB/FFmpeg ok, phone-format m4a decoded as aac/44100/1 →
    503 provider_not_configured, silence → 422, catalog roundtrip on Postgres).
  - `ruff check` + `ruff format --check` clean.
- **Failures along the way:** (1) test passed `DecodedAudio` instead of samples to `rms_dbfs`
  (test bug, fixed); (2) SQLite returned naive datetimes → `created_at` lost its `Z` between POST
  and GET (real bug, fixed with `UTCDateTime`, F-006).
- **Review findings:** independent review agent ran after this commit — see IT-003.
- **Commit:** originally `b492c95` (pre-restructure hash, no longer exists — see IT-006); now spread over `4de03b2`…`4d68cf1` and `80990b2`
- **Next action:** mobile app (IT-002), review fixes (IT-003).

---

## IT-003 — Independent backend review and fixes

- **Date:** 2026-10-17
- **Task:** REVIEW AGENT pass over services/, tests, infra, docs (read-only), then orchestrator fixes.
- **Review result:** no critical issues; nothing fakes recognition. 2 high, 7 medium, 14 low,
  test gaps and nits (listed below).
- **Fixed (with new tests):**
  - H1 CI lint failure in `tests/integration/test_stack.py` (formatted).
  - H2 identify did not always return `RecognitionResponse` (validation errors, malformed
    multipart, unhandled exceptions) → `envelopes.error_envelope` chooses the shape per route.
  - M1 500s lacked `X-Request-ID` → last-resort handler moved into `RequestIdMiddleware`.
  - M2 FFmpeg stderr leaked to clients → `AudioError.detail` logged only.
  - M3 Postgres-only 500 on long album tag + orphaned file → truncate, cleanup on failure.
  - M4 non-atomic reference copy → temp file + `os.replace`, size check on reuse.
  - M5 DELETE with configured-but-unavailable provider → 503 `provider_unavailable`.
  - M6 relative `audio_path` / CWD dependence → `data_dir` resolved absolute, paths stored
    relative to it.
  - M7 corrupt allowed containers returned 415 → 422 `invalid_audio` via magic-byte sniff.
  - L1 duplicate `X-Request-ID` and partial 413 body; L3 missing-ffmpeg mapped to 422; L4
    `audio_too_long` bypass via missing duration header; L5 unvalidated/log-injectable `source`;
    L6 image default DB path unwritable (default DB now under `data_dir`); L7 stale temp uploads
    swept at startup; L8 transaction held across FFmpeg; L10 lower decode/RMS memory; L11 raw
    exception text in `/ready` + DB connect timeout; L13 `/health` async; L14 strict stderr
    decoding in probe; T3 PG fixture refuses non-`_test` databases; nits (schema description,
    regex `fullmatch`, unused `session_scope`, `.dockerignore`, ADR notes on thread safety and
    checkpoint pinning, API.md error-code tables).
- **Deferred to backlog:** L2 → BE-14, L9 → BE-12, L10 streaming/L12 → BE-13, CI FFmpeg version
  → QA-4, M5 tombstones/reconciliation → BE-8.
- **Tests (run):** `uv run pytest -q` → 76 passed (SQLite); same on PostgreSQL → 76 passed;
  compose rebuilt, `tests/integration` → 5 passed; manual curl: chunked 12 MB identify → 413 with
  full shape + single request id (F-012). Ruff clean.
- **Commit:** originally `af89a6f` (pre-restructure hash, no longer exists — see IT-006); folded into the same backend commits
- **Next action:** integrate mobile app (IT-002), then commit and update STATE/HANDOFF.

---

## IT-002 — Mobile app (MOBILE ENGINEER AGENT, background subagent)

- **Date:** 2026-10-17 (ran in parallel with IT-001/IT-003; only touched `apps/mobile/` and
  `docs/MOBILE_TEST_PLAN.md`)
- **Task:** MOB-1.
- **Objective:** Real Expo app: mic permission, real expo-audio recording, multipart upload,
  state machine (idle/listening/processing/match/no-match/error) with cancel + timeouts,
  result/no-match/error/history screens, local history, dev-only file picker.
- **Changes:** `apps/mobile` (Expo SDK 58, expo-router, expo-audio 58.0.9, expo-file-system,
  AsyncStorage), `docs/MOBILE_TEST_PLAN.md` (39 manual cases, all PENDING).
- **Research done:** expo-audio 58 API confirmed from installed `.d.ts`, native sources and v58
  docs (F-019); discovered SDK 58 `expo/fetch` FormData constraint (F-018).
- **Tests (agent-reported):** typecheck clean; 136 jest tests / 7 suites; `CI=1 expo-doctor`
  20/20; `expo export` android (1190 modules) + ios (1197 modules) OK; `npm ci` OK.
- **Orchestrator re-verification:** re-ran typecheck (clean) and `npm test` (136 passed);
  reviewed `client.ts`, `recordingConfig.ts`, `useRecognition.ts`, `app.json`; grep for
  mock/fake/demo in `src/` → none in product code.
- **Deviation from brief:** upload uses an expo-file-system `File` part instead of
  `{uri, name: 'query.m4a', type}` because SDK 58's global fetch rejects the latter (F-018).
  Backend contract unaffected (filename only used for its extension).
- **Failures along the way (agent):** react-dom version conflict broke installs (F-020); TS 6
  @types loading, RNTL 14 async APIs, transformIgnorePatterns (F-021); `CI` empty (F-022).
- **Not verified:** anything on a physical device, simulator or emulator.
- **Commit:** originally `c4f177f` (pre-restructure hash, no longer exists — see IT-006); now `9768979`…`6a315cb`
- **Next action:** MOB-2 device smoke test.

---

## IT-004 — Live contract check: mobile client ↔ backend

- **Date:** 2026-10-17
- **Task:** MOB-6 — prove the app's real API client interoperates with the real backend.
- **Attempt 1 (failed):** jest test under jest-expo → every call `backend_unavailable`, because
  jest-expo replaces `fetch` with a mock. **Attempt 2 (failed):** `@jest-environment node`
  docblock → still mocked by the preset setup (F-022). **Attempt 3 (worked):** compile
  `src/api/client.ts` with `tsc --ignoreConfig --module nodenext` and run
  `scripts/contract-check.cjs` in plain Node 24 (real fetch/FormData/Blob; expo-file-system
  stubbed, file part supplied as a Blob).
- **Results against compose stack:** 7/7 ok — health; valid 6 s WAV → `model_unavailable` /
  `provider_not_configured` with `query` (pcm_s16le, 44100 Hz, 1 ch); silence → `audio_silent`;
  1 s → `audio_too_short`; text → `unsupported_audio_format`; port 9 → `network_unavailable`;
  abort → `cancelled`.
- **Changes:** `apps/mobile/scripts/contract-check.cjs`, `expo-file-system-node-stub.cjs`,
  `npm run contract:check`, CI stack job step, docs.
- **Limit:** uses Node's fetch, not `expo/fetch`; native upload path still needs a device.
- **Commit:** originally `c4f177f` (pre-restructure hash, no longer exists — see IT-006); now `c614418` (+ CI step in `80990b2`)
- **Next action:** M0 on a machine where model work is allowed; MOB-2 device smoke test.

---

## IT-005 — Visual check of the app (web preview)

- **Date:** 2026-10-17
- **Task:** Developer asked how the app looks. No device/emulator on this machine.
- **Method:** temporarily installed `react-native-web` + `@expo/metro-runtime`, `expo export -p web`,
  served it locally, ran the API locally with CORS, viewed at 375×812 in the browser pane (dark and
  light). Reverted all package changes afterwards (`git status` clean, `npm ci` restored).
- **Seen:** Home (idle), "Microphone access needed" error state (the pane blocks the mic, so this
  was the real permission-denied path), empty History. Result + populated History were viewed with
  a **sample entry injected into browser localStorage only** (titled "SAMPLE — …"), removed after.
- **Not seen:** listening/processing states (no mic), `__DEV__` developer tools (production export).
- **Finding:** header-right buttons ("History", "Clear") sit flush against the right edge on web
  (F-024). Probably web-only; verify on device (MOB-7).

---

## IT-006 — GitHub remote, session transcript, history restructure

- **Date:** 2026-10-17
- **Changes:** remote `origin` = `git@github.com:usamex/musiccheck.git` (public). Redacted
  transcript `docs/agent/sessions/2026-10-17-session-1.md` + `scripts/session_to_markdown.py`
  (raw export kept out of git: it contains account email, local config, hidden reasoning).
- **History rewrite (developer request):** the first push had 6 large commits with AI attribution
  trailers. The history was rebuilt as ~37 focused commits from the identical final tree, without
  attribution, and force-pushed (`--force-with-lease`). Old hashes quoted in the transcript and in
  earlier iteration entries refer to the discarded history. A local branch
  `backup/pre-restructure` kept the old history on the original machine.
- **Convention adopted:** small focused commits, no AI attribution (CLAUDE.md).
- **CI:** first GitHub run on the pre-rewrite history (tree identical to the rewritten `main` except
  docs) — run 39069142524: Backend, Docker Compose stack + integration (incl. mobile contract
  check), Mobile — all success. The rewrite was force-pushed by the developer.
- **Next action:** M0 model research on a machine where model work is allowed; MOB-2 device test.

---

## IT-007 — Dark redesign with Gemini's palette

- **Date:** 2026-10-18
- **Task:** Developer: "work on the design of the app. Use the dark colors that's in gemini app".
- **Research:** read Gemini's dark tokens from gemini.google.com's computed CSS variables (F-028).
- **Changes:** dark-only theme tokens (ADR-0006); `expo-linear-gradient`, `@expo/vector-icons`,
  `expo-font`; gradient identify disc with mic / sound-wave icon, stacked-halo glow, gradient
  ripples while listening; pill `ActionButton` (filled / tonal, optional icon); `IconButton` for
  header actions (history, delete); recording pill; restyled error card, result (gradient artwork
  tile, provider chip, details card, full-width CTA), history (cards with gradient tiles,
  chevrons, empty state), dev tools. Jest icon mock (F-025).
- **Tests:** typecheck clean; 136/136 jest; `expo-doctor` 20/20 (after adding `expo-font`);
  `npm run export:check` android + ios OK.
- **Visual check (web preview, temporary react-native-web, reverted):** home idle, listening
  (synthetic in-browser audio stream because the pane blocks the mic), "App not configured"
  error, history and result with a localStorage-only SAMPLE entry (removed). Fixed during the
  check: flat glow → stacked halos; label overlapping glow; header icon flush (F-026); duplicate
  "Listening…" label.
- **Failures along the way:** icon font under Jest (F-025); idle animation loop broke RNTL
  (F-027); `forwardRef` typing with React 19 → plain function, `ref` via props.
- **Not verified:** any device rendering (MOB-8).

---

## IT-008 — Model desk research (no model work)

- **Date:** 2026-10-20
- **Task:** ML-1 + ML-2 as desk research only (developer: "figure out which AI model … don't add
  it"; work computer → nothing downloaded/installed/run).
- **Method:** `deep-research` workflow: 5 angles, 19 primary sources, 95 claims extracted, 25 key
  claims verified by 3 independent agents each (21 confirmed, 4 refuted); orchestrator re-checked
  both licences against raw LICENSE files, GitHub API and Zenodo API.
- **Result:** primary NMFP `nmfp-triplet` (only public weights with real phone/room results;
  licence ambiguity GPLv3/AGPLv3 must be resolved first), fallback Pretrained Conformer-large
  (CC-BY-4.0, no real-recording evidence), GraFPrint third (weights unlicensed). Full write-up
  and EXP-001 plan: docs/MODEL_RESEARCH.md; findings F-029..F-032; backlog ML-1b added.
- **Failures / corrections:** a WebFetch page summary claimed NMFP's LICENSE file is AGPL; the
  raw file and GitHub API show plain GPLv3 (F-029). Four over-reaching claims refuted in
  verification (see MODEL_RESEARCH.md).
- **Next action:** ML-1b (licence) → ML-3 on a non-work machine.

---

## IT-009 — "Listen on" buttons (Spotify, YouTube Music, Apple Music)

- **Date:** 2026-10-18 (implemented) – 2026-10-20 (committed); logged after IT-008.
- **Task:** Developer: matched songs should link to Spotify, YouTube Music and Apple Music,
  "depending which apps the user is using".
- **Research:** Expo Linking / "linking into other apps" docs, expo-build-properties
  `manifestQueries`, Spotify content-linking docs, scheme availability per service (F-033).
- **Design:** search links for "title artist" (no service track IDs in our catalog; exact links
  = BE-15); https URLs open the app via universal / app links or fall back to the website;
  hide only apps *confirmed* missing, list installed apps and the last-used service first
  (AsyncStorage), show all when detection is impossible (Expo Go, web) or everything is missing.
- **Changes:** `app.json` (iOS LSApplicationQueriesSchemes `spotify`, `music`; Android query for
  `spotify:` via expo-build-properties), `src/listen/services.ts` (definitions, detection,
  ordering), `useListenServices.ts`, `ListenButtons.tsx`, ResultView `listen` slot.
- **Tests:** 17 new (URL encoding, detection per platform / Expo Go / web / rejected probes,
  ordering, opening + remembered preference, open failure) → 153 total pass; typecheck clean;
  `export:check` android + ios OK; `expo config --type introspect` shows the iOS schemes and the
  Android `<queries>` entry.
- **Failures along the way:** Jest call history leaked between tests because RN's Linking mocks
  are shared `jest.fn`s (fixed with `jest.clearAllMocks()`); the previous session ended while
  building a web preview (package files verified clean afterwards); first commit attempt bundled
  every file (F-034) — undone before pushing and redone with `/usr/bin/git`.
- **Not verified:** any device behaviour (MOB-9). expo-doctor 19/20 due to new SDK patches (F-035).
- **Next action:** MOB-9 together with MOB-2 on a device / development build.
