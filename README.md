# MusicCheck

A Shazam-style music recognition app: open the app, tap, let it listen, see the song.
Recognition will be done by our own **neural audio-fingerprinting model** against **our indexed
catalog** of legally usable recordings — it does not (and will not claim to) recognise every song.

> **Current status (2026-10-17):** mobile app, API, catalog, database and Docker stack are built
> and tested. **No recognition model is integrated yet**, so the API honestly answers
> `provider_unavailable` and the app shows "model unavailable". See `docs/agent/STATE.md`.

| Part | Path | Tech |
|---|---|---|
| Mobile app | `apps/mobile` | Expo SDK 58, React Native, TypeScript, expo-audio, expo-router |
| API | `services/api` | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL |
| Recognition engine | `services/recognition` | Provider interface, FFmpeg audio I/O (model: TBD, M0) |
| Contract | `packages/shared/openapi.json`, `docs/API.md` | OpenAPI 3 |
| ML work | `ml/` | experiments, evaluation, model notes |
| Infra | `compose.yaml`, `infrastructure/` | Docker Compose, GitHub Actions |

## Quick start
```bash
cp .env.example .env                       # set MUSICCHECK_CATALOG_ADMIN_TOKEN
docker compose up -d --build --wait        # API on http://<your-LAN-IP>:8000
# mobile: see apps/mobile/README.md (set EXPO_PUBLIC_API_BASE_URL to the LAN IP, run Expo Go)
```

Tests: `uv sync && uv run pytest -q` (needs FFmpeg). Everything else: **`CLAUDE.md`** (rules,
commands) and **`docs/agent/HANDOFF.md`** (onboarding). The original project brief is `PROMPT.md`.
