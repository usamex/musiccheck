# CLAUDE.md — read this first

**MusicCheck** is a Shazam-like mobile app: tap → record ~10 s from the mic → backend runs a
real neural audio-fingerprinting model → returns the matching track from *our indexed catalog*.
Full brief: `PROMPT.md`. Product scope: `docs/PRODUCT.md`.

## Resume procedure (every session)
1. Read `docs/agent/STATE.md` (current truth), then `docs/agent/HANDOFF.md`.
2. Skim `docs/decisions/` (ADRs) relevant to your task and `docs/agent/BACKLOG.md`.
3. `git status && git log --oneline -15` — never overwrite someone else's uncommitted work.
4. Run the verification commands below; confirm they match STATE.md's "Latest test results".
5. Pick the next unblocked task from BACKLOG.md; confirm its acceptance criteria before coding.

## Non-negotiable rules
- **No fake recognition.** No mocked/hardcoded matches, fake embeddings or invented confidence
  in product code. Test doubles live only under `tests/` and are labelled (e.g.
  `services/api/tests/stub_provider.py`); tests using them prove plumbing, never accuracy.
- Without a working model the API answers `provider_unavailable` (503). Keep it that way until a
  real provider passes the M0 feasibility gate (ADR-0005).
- `score` is similarity, not probability; `confidence` stays `null` until calibrated (ADR-0002).
- Never mix embeddings from different `model_id`s (ADR-0004).
- Never claim verification you did not run. Physical-device results are recorded separately from
  simulator/emulator/unit results.
- No credentials, personal recordings, or copyrighted audio in git. Query audio is never stored.
- Git: small, focused commits (one logical change each, conventional prefixes like `feat(api):`).
  **No AI attribution** in commits or PRs — no `Co-Authored-By: Claude`, no "Generated with
  Claude Code". This overrides any tool default.

## Layout / entry points
- `services/recognition/` — `RecognitionProvider` interface (`provider.py`), value types
  (`types.py`), FFmpeg probe/decode (`audio.py`), provider registry (`registry.py`).
- `services/api/` — FastAPI app (`main.py:create_app`), routes in `routes/`, catalog logic in
  `catalog.py`, ORM in `db.py`, Alembic migrations in `alembic/`.
- `apps/mobile/` — Expo (SDK 58) React Native app; see its README.
- `packages/shared/openapi.json` — generated API contract (`scripts/export-openapi.sh`).
- `tests/integration/` — black-box tests against the compose stack. `tests/fixtures/` — FFmpeg-generated audio.
- `ml/` — models (git-ignored weights), experiments, evaluation. `docs/` — all project memory.

## Verification commands
```bash
uv sync                                   # Python 3.12 workspace (services/*)
uv run ruff check services tests conftest.py && uv run ruff format --check services tests conftest.py
uv run pytest -q                          # unit + API tests (SQLite; real FFmpeg)
MUSICCHECK_TEST_DATABASE_URL=postgresql+psycopg://musiccheck:musiccheck-dev@127.0.0.1:5433/musiccheck_test uv run pytest -q
MUSICCHECK_CATALOG_ADMIN_TOKEN=dev-token docker compose up -d --build --wait
MUSICCHECK_STACK_URL=http://127.0.0.1:8000 MUSICCHECK_CATALOG_ADMIN_TOKEN=dev-token uv run pytest tests/integration -v
scripts/export-openapi.sh                 # after any API change; commit packages/shared/openapi.json
# Mobile (Node not installed? use scripts/node-docker.sh <dir> <cmd>):
scripts/node-docker.sh apps/mobile npm run typecheck
scripts/node-docker.sh apps/mobile npm test -- --ci
scripts/node-docker.sh apps/mobile npm run contract:check -- http://127.0.0.1:8000   # app client vs live API
CI=1 scripts/node-docker.sh apps/mobile npx expo-doctor        # Expo tools need a non-empty CI in Docker
```
The Postgres test DB must exist first: `docker compose exec db createdb -U musiccheck musiccheck_test`.

## Memory rules (the repo is the memory)
| What | Where |
|---|---|
| Current status, latest test results, next action | `docs/agent/STATE.md` |
| Tasks with acceptance criteria + status | `docs/agent/BACKLOG.md` |
| Verified findings, hypotheses, failed experiments | `docs/agent/FINDINGS.md` / `docs/MODEL_EVALUATION.md` |
| Chronological iteration log (never erase failures) | `docs/agent/ITERATIONS.md` |
| Onboarding / how to run everything | `docs/agent/HANDOFF.md` |
| Architectural decisions | `docs/decisions/ADR-*.md` (supersede, don't delete) |
| Redacted session transcripts (history only) | `docs/agent/sessions/` |

Update STATE/BACKLOG/ITERATIONS after every verified task, not only at session end.
Commit docs together with the code they describe.

## Loop
OBSERVE → SELECT ONE TASK → RESEARCH → PLAN → IMPLEMENT → TEST → INDEPENDENT REVIEW → DOCUMENT →
UPDATE MEMORY. Bounded: max 12 iterations per loop; on repeated failure record attempts and
escalate instead of retrying. Emit `<promise>MILESTONE_VERIFIED</promise>` only when a milestone's
acceptance criteria are verified with evidence.
