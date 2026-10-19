# State — authoritative current status

Last updated: 2026-10-17, end of session 1. Branch: `main`, remote `origin` = github.com/usamex/musiccheck (public).

## Active milestone
**M1 — first working end-to-end application.** Non-model parts are built. **M0 (model
feasibility) has not started**: it was deliberately deferred this session (developer on a work
computer, ADR-0005). M1 cannot be accepted without M0.

## Current task
None in progress. Next recommended: ML-1/ML-2 (model research) on a machine where model work is
allowed, in parallel with DS-1 (licensed reference set) and BE-7 (bulk ingest / re-index CLI).

## Verified (with evidence in ITERATIONS.md)
| Feature | Evidence |
|---|---|
| API `/health`, `/ready` (honest: 503, recognition not configured) | unit + integration tests (IT-001/003) |
| `POST /v1/recognition/identify`: upload limits (incl. real chunked stream), FFmpeg probe/decode, length/silence gates, always-RecognitionResponse, 503 `provider_not_configured` with decoded `query` | 76 backend tests on SQLite + PostgreSQL; compose integration; curl (F-012) |
| Catalog ingest/get/list/delete, SHA-256 idempotency, atomic storage, admin token | tests (IT-001/003) |
| PostgreSQL + Alembic + Docker Compose stack | `docker compose up --wait` healthy; integration 5/5 |
| Mobile app compiles, unit tests, bundles for Android + iOS | typecheck, 136 jest tests, `expo export` both platforms, expo-doctor 20/20 (IT-002, re-run by orchestrator: typecheck + 136 tests) |
| Mobile API client ↔ live backend contract | `npm run contract:check` 7/7 against the compose stack (IT-004) |
| Dark redesign (Gemini palette, ADR-0006) renders: home idle/listening/error, history, result | web preview screenshots (IT-007); typecheck, 136 tests, expo-doctor 20/20, android+ios bundle export |
| GitHub Actions CI (backend on PostgreSQL, compose stack + integration + contract check, mobile) | run 39069142524: all 3 jobs success (IT-006) |

## Implemented but NOT verified
- Dark redesign on a real device (MOB-8). Real microphone capture, recording format on device, expo/fetch file upload, permission flows,
  Expo Go SDK 58 compatibility — **no physical device, simulator or emulator run** (MOB-2).
- Indexing on ingest — only exercised with the test double `StubProvider` (no real model).

## Not implemented
- Recognition model / `NeuralRecognitionProvider` (ML-1..ML-5) — **the app cannot identify songs yet.**
- Licensed reference catalog (DS-1), bulk ingest / re-index CLI (BE-7).
- Evaluation suite, calibration (ML-6/ML-7). External providers (EXT-1).

## Known failures / risks
- None failing in automated checks.
- Silence gate −60 dBFS is uncalibrated (F-011).
- `npm audit`: 47 advisories in Expo/Metro/Jest tooling (F-023).
- FFmpeg not yet sandboxed beyond protocol/format allowlists + timeouts (BE-12).

## Blocking issues
- M0 blocked by developer decision for this machine (no model work on the work computer).
- MOB-2 needs a developer with a phone (Expo Go SDK 58) on the same LAN as the backend.

## Latest test results (2026-10-17)
- `uv run pytest -q` → **76 passed** (SQLite). With `MUSICCHECK_TEST_DATABASE_URL` (Postgres 17) → **76 passed**.
- `uv run pytest tests/integration` against compose stack → **5 passed**.
- `ruff check` / `ruff format --check` → clean.
- GitHub Actions run 39069142524 (same code as current `main`): Backend ✅, Docker Compose stack + integration ✅, Mobile ✅.
- `apps/mobile`: `npm run typecheck` → clean; `npm test` → **136 passed (7 suites)**;
  `npm run contract:check` → **7/7 ok**; expo-doctor 20/20 and `expo export` android/ios → ok
  (reported by mobile agent, IT-002).

## Next recommended action
1. Model desk research is done (IT-008, docs/MODEL_RESEARCH.md): primary NMFP nmfp-triplet,
   fallback Pretrained Conformer-large. Next: ML-1b licence decision, then ML-3 (EXP-001) on a
   machine where model work is OK.
2. Meanwhile (any machine): DS-1 + BE-7; MOB-2 device smoke test of the current
   "model unavailable" flow (proves capture + upload + format).
