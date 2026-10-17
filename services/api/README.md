# musiccheck-api

FastAPI service: recognition endpoint, catalog management, health/readiness.
Contract: `docs/API.md` (+ generated `packages/shared/openapi.json`). Design: `docs/ARCHITECTURE.md`.

## Run locally (without Docker)
```bash
uv sync                                    # from the repo root
uv run python -m musiccheck_api.migrate    # SQLite at ./data/musiccheck.db by default
MUSICCHECK_CATALOG_ADMIN_TOKEN=dev-token uv run musiccheck-api   # http://0.0.0.0:8000, docs at /docs
```
Requires `ffmpeg` and `ffprobe` on PATH. With Docker instead: `docker compose up -d --build`.

## Configuration (`MUSICCHECK_*` env vars or `.env`)
| Variable | Default | Meaning |
|---|---|---|
| `ENV` | `development` | Free-form environment name. |
| `LOG_LEVEL` | `INFO` | Python log level. |
| `DATABASE_URL` | `sqlite:///./data/musiccheck.db` | SQLAlchemy URL. Postgres: `postgresql+psycopg://user:pw@host:5432/db`. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Catalog audio (`catalog/audio/`), temp uploads (`tmp/`). |
| `RECOGNITION_PROVIDER` | `none` | Provider name from the registry. Only `none` exists today. |
| `VALIDATION_SAMPLE_RATE` | `16000` | Decode rate for validation when no provider is set. |
| `MAX_UPLOAD_BYTES` | `10485760` | Identify upload cap (413 above). |
| `MIN_QUERY_SECONDS` | `2.0` | Shorter recordings → 422 `audio_too_short`. |
| `MAX_QUERY_SECONDS` | `30.0` | Only this much of a query is analysed. |
| `SILENCE_DBFS` | `-60.0` | RMS gate → 422 `audio_silent`. Heuristic; calibrate (QA-3). |
| `DECODE_TIMEOUT_SECONDS` | `15.0` | FFmpeg timeout for queries (504 `processing_timeout`). |
| `CATALOG_ADMIN_TOKEN` | unset | Bearer token for catalog writes. Unset/blank → writes disabled (503). |
| `MAX_REFERENCE_UPLOAD_BYTES` | `209715200` | Reference upload cap (authenticated only; others capped at 1 MiB). |
| `MAX_REFERENCE_SECONDS` | `1200` | Longer references → 422 `audio_too_long`. |
| `REFERENCE_DECODE_TIMEOUT_SECONDS` | `120` | FFmpeg timeout for references. |
| `CORS_ALLOW_ORIGINS` | `[]` | JSON list; only needed for browser clients. |
| `ALEMBIC_INI` | `services/api/alembic.ini` | Override location for packaged installs. |

## Add a reference track
```bash
curl -H "Authorization: Bearer $MUSICCHECK_CATALOG_ADMIN_TOKEN" \
  -F audio=@song.mp3 -F title="Song" -F artist="Artist" -F license="CC-BY-4.0" -F source="fma_small" \
  http://localhost:8000/v1/catalog/tracks
```
Without a recognition provider the track is stored with `indexing.status = "pending"`.

## Migrations
Edit `src/musiccheck_api/db.py`, then from `services/api/`:
`MUSICCHECK_DATABASE_URL=sqlite:////tmp/x.db uv run alembic upgrade head && uv run alembic revision --autogenerate -m "..."`.
`tests/test_schema_and_contract.py` fails if models and migrations diverge.
