# Deployment

**Status: local development only.** Nothing is deployed anywhere. M5 covers real deployment;
do not deploy without explicit authorization.

## Local stack (verified 2026-10-17 on Linux, Docker 29.7, Compose v5.4)
```bash
cp .env.example .env          # set MUSICCHECK_CATALOG_ADMIN_TOKEN to a random value
docker compose up -d --build --wait
curl -s localhost:8000/health
curl -s localhost:8000/ready   # 503 until a recognition provider exists (expected today)
```
- `db`: postgres:17-alpine, bound to `127.0.0.1:${MUSICCHECK_DB_PORT:-5433}`, volume `pgdata`.
- `api`: built from `infrastructure/docker/api.Dockerfile` (python:3.12-slim-trixie + FFmpeg 7.1,
  uv-installed from `uv.lock`), runs Alembic migrations on start, serves on
  `0.0.0.0:${MUSICCHECK_API_PORT:-8000}`, data volume `apidata` at `/data`, non-root user.
- Phones on the same Wi-Fi reach `http://<computer-LAN-IP>:8000`. Check the host firewall.

## Configuration
See `services/api/README.md` for every `MUSICCHECK_*` setting. Secrets (admin token, future
provider API keys) only via environment / `.env` (git-ignored) — never in the mobile app.

## Before any non-local deployment (M5 checklist, not started)
TLS termination; rate limiting on identify; request/body limits at the proxy; secret manager;
structured logging + error reporting without audio/PII; backups for Postgres and catalog audio;
model checkpoint provisioning (volume, checksum verification at startup); license review
(AGPL implications if NMFP is chosen); privacy/data-retention review; resource sizing from
measured inference latency/memory.
