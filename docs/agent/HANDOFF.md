# Handoff

For a new developer or AI agent. Read `CLAUDE.md` first, then `docs/agent/STATE.md`.
Last updated: 2026-10-17 (end of session 1).

## What the application does today
- **Mobile app** (`apps/mobile`, Expo SDK 58): records 10 s from the microphone (AAC/m4a, mono,
  44.1 kHz), uploads it to the API, and shows the outcome (match / no match / specific error),
  with local history of matches. Developer builds show a "Developer tools" box (server check,
  identify-from-file). It has **not been run on a phone, simulator or emulator yet** — its
  typecheck/unit tests/bundle exports pass and its API client was checked against the live
  backend (`npm run contract:check`).
- **API** (`services/api`): accepts the recording, validates and decodes it with FFmpeg, and —
  because **no recognition model is integrated yet** — returns
  `503 {"status": "provider_unavailable", "error": {"code": "provider_not_configured"}}` together
  with what it decoded (`query.codec/sample_rate/channels/duration`). The app shows this as
  "model unavailable". Catalog endpoints store reference recordings (`indexing.status = pending`).
- Nothing in the product returns a fake match.

## Recognition model
- **Selected model: none.** NMFP (`raraz15/neural-music-fp`) is the preferred candidate to
  evaluate; `mimbres/neural-audio-fp` is the alternative. Research has not started
  (`docs/MODEL_RESEARCH.md`, backlog ML-1..ML-5). No weights have been downloaded.
- Plug-in point: implement `RecognitionProvider` (`services/recognition/src/musiccheck_recognition/provider.py`),
  register it in `registry.py`, set `MUSICCHECK_RECOGNITION_PROVIDER=<name>`. Rules: ADR-0003/0004.

## Environment setup
Prerequisites: Docker + Compose, FFmpeg, [uv](https://docs.astral.sh/uv/). Node 24 for the mobile
app — or use `scripts/node-docker.sh` (runs Node in Docker). A phone with **Expo Go** (SDK 58).

```bash
git clone git@github.com:usamex/musiccheck.git && cd musiccheck
cp .env.example .env            # set MUSICCHECK_CATALOG_ADMIN_TOKEN (random string)
uv sync                         # Python 3.12 venv for both services (uv downloads 3.12 if needed)
```

## Start the backend
```bash
docker compose up -d --build --wait     # Postgres + API (migrations run automatically)
curl -s http://127.0.0.1:8000/health    # {"status":"ok",...}
curl -s http://127.0.0.1:8000/ready     # 503 until a model exists — expected
```
Without Docker: `uv run python -m musiccheck_api.migrate && uv run musiccheck-api` (SQLite).

## Start the mobile app
See `apps/mobile/README.md`. In short: `apps/mobile/.env` with
`EXPO_PUBLIC_API_BASE_URL=http://<computer LAN IP>:8000` (not `localhost`), then
`npm ci && npx expo start` — or without Node:
`EXPO_PUBLIC_API_BASE_URL=http://<LAN IP>:8000 scripts/node-docker.sh apps/mobile npx expo start`
— and scan the QR code with Expo Go (SDK 58) on a phone on the same Wi-Fi. Today the expected
result of tapping Identify is "Recognition model unavailable"; developer builds show
"Server decoded: aac · 44100 Hz · 1 ch", which proves the recording reached the backend.
Note the SDK 58 upload detail (expo/fetch + expo-file-system `File`, FINDINGS F-018).

## Run automated tests
```bash
scripts/node-docker.sh apps/mobile npm ci                     # once (or npm ci with local Node)
uv run pytest -q                                              # backend, SQLite, real FFmpeg
docker compose exec db createdb -U musiccheck musiccheck_test # once
MUSICCHECK_TEST_DATABASE_URL=postgresql+psycopg://musiccheck:musiccheck-dev@127.0.0.1:5433/musiccheck_test uv run pytest -q
MUSICCHECK_STACK_URL=http://127.0.0.1:8000 MUSICCHECK_CATALOG_ADMIN_TOKEN=<token from .env> uv run pytest tests/integration -v
scripts/node-docker.sh apps/mobile npm run typecheck
scripts/node-docker.sh apps/mobile npm test -- --ci
scripts/node-docker.sh apps/mobile npm run contract:check -- http://127.0.0.1:8000  # stack must be up
```
Manual device tests: `docs/MOBILE_TEST_PLAN.md` (record physical-device and simulator results in
separate columns, with device, OS version and commit).

## Reproduce a recognition test
Not possible yet — there is no model. What *can* be reproduced:
```bash
ffmpeg -f lavfi -t 6 -i "sine=frequency=440" -ac 1 -c:a aac -ar 44100 /tmp/q.m4a
curl -s -F audio=@/tmp/q.m4a http://127.0.0.1:8000/v1/recognition/identify | python -m json.tool
# → status provider_unavailable, query.codec "aac", sample_rate 44100, channels 1
```
After ML-4: ingest licensed references (`POST /v1/catalog/tracks`, see services/api/README.md),
then identify a different excerpt and expect `status: matched` with the right track.

## What currently fails / is missing
- No recognition model (M0 not started) → M1 cannot be accepted.
- Mobile app never run on a device/simulator (MOB-2); 39 manual cases PENDING.
- CI workflow: first run triggered by the initial push to github.com/usamex/musiccheck; check the Actions tab (QA-1).
- No re-index/bulk-ingest CLI (BE-7), no reference dataset chosen (DS-1).

## What to implement next (in order)
1. ML-1/ML-2 model research → ML-3 feasibility experiment (on a machine where model work is OK).
2. DS-1 licensed reference set + BE-7 bulk ingest/re-index CLI.
3. ML-4 `NeuralRecognitionProvider` → ML-5 real-inference integration test.
4. MOB-2 device verification, then QA-2 (M1 acceptance: phone → correct song).
