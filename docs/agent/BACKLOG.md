# Backlog

Status values: `todo` · `in-progress` · `blocked` · `done` (verified with evidence, see ITERATIONS.md) ·
`done-unverified-on-device` (code + automated checks done; device verification pending).
Priority: P0 (needed for M1) · P1 (M2/M3) · P2 (later) · P3 (exploratory).

## M0 — AI model feasibility

| ID | Description | Pri | Depends | Acceptance criteria | Status |
|---|---|---|---|---|---|
| ML-1 | Research NMFP (raraz15/neural-music-fp, `nmfp-triplet`): weights availability, checksums, code/weights license and AGPLv3 network-use implications, framework, preprocessing (sample rate, segment/hop, features), embedding dim, CPU feasibility, reported robustness, training data. | P0 | – | `docs/MODEL_RESEARCH.md` checklist filled for NMFP with sources; license consequences in a new ADR. | done — desk research (IT-008, docs/MODEL_RESEARCH.md); licence follow-up ML-1b |
| ML-2 | Research mimbres/neural-audio-fp and newer neural music-ID models with public weights. | P0 | – | Same checklist per candidate; comparison table; recommendation. | done — desk research (IT-008): fallback Pretrained Conformer (CC-BY-4.0) |
| ML-1b | Resolve NMFP licence: contact authors (README AGPLv3 vs LICENSE GPLv3 vs Zenodo GPL-3.0-or-later; commercial licence?); record decision + consequences for the hosted API in an ADR. | P0 | ML-1 | ADR accepted; written answer from authors or documented AGPL-compliant plan. | todo |
| ML-3 | EXP-001 feasibility: obtain checkpoint, verify source/license/checksum, load, embed real audio, index ≥5 licensed references, query different excerpts, test unknown audio, measure CPU latency. | P0 | ML-1b, DS-1 | `ml/experiments/EXP-001…/README.md` with commands + raw outputs; correct top-1 on known excerpts and rejection behaviour on unknowns reported honestly; all 10 gate items in MODEL_RESEARCH.md checked. | todo |
| ML-4 | `NeuralRecognitionProvider` implementing `RecognitionProvider`: model-specific preprocessing, segment embeddings, FAISS index persisted per `model_id`, top-k retrieval + offset-voting temporal consistency, explicit no_match rejection, `ModelInfo` with checkpoint SHA-256; register in `registry.py`; ML deps as optional extra of `musiccheck-recognition`; Docker image variant. | P0 | ML-3 | Provider unit tests on real model outputs; refuses to load an index with another `model_id`; `/ready` 200 with indexed catalog. | todo |
| ML-5 | Real-inference integration test: ingest licensed references → index → identify a different excerpt via HTTP → expected track; unknown excerpt → no_match. | P0 | ML-4, DS-1 | Test in `tests/integration` (or `tests/e2e`) runs the actual model in CI or a documented manual job. | todo |
| ML-6 | Calibrate rejection threshold (and optionally `confidence`) on dev queries; document `score_kind` semantics. | P1 | ML-4, ML-7 | Threshold chosen from recorded dev data; FPR/recall on eval set in MODEL_EVALUATION.md. | todo |
| ML-7 | Evaluation suite in `ml/evaluation` per MODEL_EVALUATION.md methodology (degradations, unknowns, latency, storage). | P1 | ML-4 | One command reproduces the results table. | todo |
| ML-8 | Optional classical landmark-fingerprint provider as a clearly labelled baseline for comparison. | P2 | ML-7 | Separate provider id; never default; compared in MODEL_EVALUATION.md. | todo |

## Data

| ID | Description | Pri | Depends | Acceptance criteria | Status |
|---|---|---|---|---|---|
| DS-1 | Choose 20–50 legally usable reference recordings (e.g. FMA subset); verify per-file licenses; commit a manifest + download script (no audio). | P0 | – | `docs/DATASETS.md` lists source, per-track license, checksums; script fetches them reproducibly. | todo |
| DS-2 | Dev/eval split and unknown-track set; document overlap with the model's training data. | P1 | DS-1, ML-1 | Split files committed; overlap analysis in MODEL_EVALUATION.md. | todo |

## Backend

| ID | Description | Pri | Depends | Acceptance criteria | Status |
|---|---|---|---|---|---|
| BE-1 | FastAPI app, `/health`, `/ready`, request ids, error envelope. | P0 | – | Tests pass; `/ready` reports DB, FFmpeg, provider, catalog honestly. | done (IT-001) |
| BE-2 | `POST /v1/recognition/identify`: upload limits (incl. chunked), FFmpeg probe/decode with allowlists + timeouts, length/silence gates, provider checks, response contract. | P0 | BE-1 | Tests with real FFmpeg on generated audio for every outcome; 503 `provider_not_configured` today. | done (IT-001) |
| BE-3 | Catalog API: ingest (SHA-256 idempotent, tag fallback, stored originals), get, list, delete; admin bearer token; unauthenticated body cap. | P0 | BE-1 | Tests incl. idempotency, auth, invalid audio, delete removes file. | done (IT-001) |
| BE-4 | PostgreSQL + Alembic + Docker Compose stack. | P0 | BE-1 | Suite passes on SQLite and Postgres; compose stack healthy; integration tests pass. | done (IT-001) |
| BE-5 | OpenAPI export + drift test. | P1 | BE-2 | `packages/shared/openapi.json` current; test enforces. | done (IT-001) |
| BE-6 | Index on ingest when a ready provider supports indexing; per-model entries (ADR-0004). | P0 | BE-3 | Verified with test double only; real-model verification is ML-5. | done (plumbing only) |
| BE-7 | Re-index / bulk-ingest CLI: ingest from DS-1 manifest; index `pending`, `failed` and stale `indexing` entries for the active model; resumable. | P0 | BE-6 | Interrupt mid-run, rerun → all tracks `indexed`, no duplicates. | todo |
| BE-8 | Startup reconciliation between provider index and DB entries for active `model_id`. | P1 | ML-4 | Mismatch is reported in `/ready` and logs. | todo |
| BE-9 | Bound recognition time (504 `processing_timeout`) and concurrency (worker/thread limits for model inference). | P1 | ML-4 | Load test shows bounded latency/memory. | todo |
| BE-10 | Rate limiting on identify; production hardening. | P2 | – | M5 checklist. | todo |
| BE-11 | Structured JSON logs + metrics (latency per stage). | P2 | – | Per-stage timings visible. | todo |
| BE-12 | FFmpeg sandboxing: `-codec_whitelist` for audio decoders, CPU/memory rlimits (via `prlimit`, not `preexec_fn` — threads), scrubbed env without DB credentials. From review IT-003 L9. | P1 | – | Malicious-input tests; memory cap enforced. | todo |
| BE-13 | Body-limit path matching under a proxy `root_path` (review L12); stream reference decode in chunks to cut ~220 MB peak for 20-min files (L10). | P2 | – | Tests with root_path; measured peak RSS. | todo |
| BE-14 | Catalog writes while disabled: return 503 `catalog_admin_disabled` instead of 413 for large bodies (review L2, cosmetic). | P3 | – | Test. | todo |

## Mobile

| ID | Description | Pri | Depends | Acceptance criteria | Status |
|---|---|---|---|---|---|
| MOB-1 | Expo SDK 58 app: mic permission, real expo-audio recording (AAC/m4a mono 44.1 kHz, 10 s), multipart upload, state machine with cancel/timeout, result/no-match/error screens, local history, dev-only file picker. | P0 | BE-2 | Typecheck + unit tests + Metro bundle export pass; manual device test plan written. | done-unverified-on-device (IT-002) |
| MOB-2 | Physical-device verification on iOS and Android per `docs/MOBILE_TEST_PLAN.md` (against the real backend; model-unavailable path today, recognition after ML-4). | P0 | MOB-1 | Device results recorded with device/OS/commit. | blocked (needs developer + phone) |
| MOB-3 | Generate TS types from `packages/shared/openapi.json` (e.g. openapi-typescript) and check drift in CI. | P2 | MOB-1 | No hand-maintained contract types. | todo |
| MOB-5 | Release hardening from IT-002: block unneeded default Android permissions (storage, SYSTEM_ALERT_WINDOW), set iOS bundle id / Android package, restrict ATS/cleartext to dev, add ESLint (`npx expo lint`). | P2 | MOB-2 | expo-doctor + introspected config show only RECORD_AUDIO/INTERNET (+ required). | todo |
| MOB-6 | Contract check of the real client against the live API (`npm run contract:check`), in CI stack job. | P1 | MOB-1 | 7/7 checks pass against compose stack. | done (IT-004; CI not yet run on GitHub) |
| MOB-7 | Check header-right button spacing on iOS + Android (F-024). | P3 | MOB-2 | Screenshot from each platform. | fixed on web (IT-007, F-026); device check pending |
| MOB-8 | Device check of the dark redesign (ADR-0006): gradients, shadows/glow, icon font, listening ripples, contrast in sunlight. | P1 | MOB-2 | Screenshots from iOS + Android in MOBILE_TEST_PLAN. | todo |
| MOB-4 | Development build (EAS) incl. cleartext/ATS config for LAN dev and HTTPS for prod. | P2 | MOB-2 | Installable build on both platforms. | todo |

## QA / process

| ID | Description | Pri | Depends | Acceptance criteria | Status |
|---|---|---|---|---|---|
| QA-1 | Push to a GitHub remote and get `.github/workflows/ci.yml` green. | P1 | – | All CI jobs green on GitHub. | done (IT-006: run 39069142524 all jobs green) |
| QA-2 | M1 acceptance E2E: phone records indexed song → backend (real model) → correct result displayed. | P0 | ML-4, MOB-2, DS-1 | Recorded with device details; screenshot or log with request_id. | todo |
| QA-4 | CI should test with FFmpeg 7.1 like the image (Ubuntu runners ship 6.1) — e.g. run backend tests inside the API image. | P2 | QA-1 | Same FFmpeg major in CI and prod. | todo |
| QA-3 | Calibrate the silence gate with real phone recordings (quiet room, distant music). | P2 | MOB-2 | Chosen `SILENCE_DBFS` justified by measured levels. | todo |

## External providers (M4)

| ID | Description | Pri | Depends | Acceptance criteria | Status |
|---|---|---|---|---|---|
| EXT-1 | Research ShazamKit / ACRCloud / AudD: platform limits, auth, pricing, licensing, privacy, rate limits; which fit the server-side provider interface. | P3 | – | Comparison doc + ADR; no secrets in the app. | todo |
