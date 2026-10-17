# ADR-0001: Monorepo layout and initial technology stack

- Status: Accepted
- Date: 2026-10-17

## Context
The brief (PROMPT.md §3, §12) asks for a transferable monorepo with an Expo mobile app, a
FastAPI backend, a separately replaceable recognition engine, PostgreSQL, Docker Compose and CI.

## Decision
- **Python workspace managed by uv** (root `pyproject.toml`, `uv.lock`), Python 3.12
  (`.python-version`). Two packages:
  - `services/recognition` (`musiccheck_recognition`): provider interface, audio I/O, registry.
    Will hold ML dependencies (as an optional extra) once a model is selected.
  - `services/api` (`musiccheck_api`): FastAPI, SQLAlchemy 2 + psycopg 3, Alembic.
  Python 3.12 rather than the host's 3.13 to maximise compatibility with TensorFlow/PyTorch/FAISS
  wheels later; revisit when the model is chosen.
- **Mobile**: Expo SDK 58 (latest on 2026-10-17, so Expo Go on current phones can run it),
  TypeScript, expo-router, expo-audio. Lives in `apps/mobile` with its own `package-lock.json`
  (no JS workspace tooling until a second JS package needs it).
- **Contract sharing**: `packages/shared/openapi.json` is generated from FastAPI and checked for
  drift by a test. The mobile app mirrors the types by hand for now (backlog MOB-3 to generate).
- **Infra**: `compose.yaml` (PostgreSQL 17 + API image built from
  `infrastructure/docker/api.Dockerfile`, Debian trixie with FFmpeg 7.1). GitHub Actions in
  `.github/workflows/ci.yml`.
- **SQLite for fast tests**, PostgreSQL in compose/CI; the same suite runs on both
  (`MUSICCHECK_TEST_DATABASE_URL`). Schema is always built through Alembic migrations.

## Consequences
- One `uv sync` sets up all Python code; the API image installs the same lockfile.
- Node is not required on the host: `scripts/node-docker.sh` runs npm/npx in `node:24`.
- Anything ML-heavy must stay inside `services/recognition` (or `ml/` for experiments) so the
  API stays model-agnostic.
