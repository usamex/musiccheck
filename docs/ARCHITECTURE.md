# Architecture

Status legend: ✅ implemented and tested · 🟡 implemented, not yet verified end-to-end · ⬜ not built.

```
┌──────────────── apps/mobile (Expo SDK 58, TS) ────────────────┐
│ Home ─ tap ─► expo-audio recorder (AAC/.m4a, mono, 44.1 kHz)   │ 🟡 (no device run yet)
│ upload: FormData + expo-file-system File via expo/fetch (SDK58)│
│   reducer: idle→listening→processing→match/no_match/error      │
│ Result / History (AsyncStorage, device-local)                  │
└───────────────┬────────────────────────────────────────────────┘
                │ multipart POST /v1/recognition/identify (field "audio")
┌───────────────▼──────────── services/api (FastAPI) ────────────┐
│ RequestId + BodySizeLimit middleware (413 while streaming)     │ ✅
│ save to temp → ffprobe (demuxer allowlist) → ffmpeg decode     │ ✅
│   mono f32 @ provider rate, ≤30 s → length gate → silence gate │ ✅
│ provider? ──no──► 503 provider_unavailable (+ query info)      │ ✅ (current behaviour)
│     │yes                                                       │
│ provider.recognize(DecodedAudio) → Recognition                 │ ✅ interface, ⬜ real provider
│ track_id → tracks table → RecognitionResponse                  │ ✅ (tested with test double)
│ Catalog: ingest (sha256-idempotent) → store original → index   │ ✅ / index step ⬜ real model
│ PostgreSQL (tracks, track_index_entries) via SQLAlchemy+Alembic│ ✅
└───────────────┬────────────────────────────────────────────────┘
                │ RecognitionProvider (ADR-0003)
┌───────────────▼──────── services/recognition ──────────────────┐
│ audio.py: probe/decode/rms (FFmpeg)                            │ ✅
│ provider.py / types.py / registry.py ("none" only)             │ ✅
│ NeuralRecognitionProvider: preprocess → encoder → segment      │ ⬜ M0/ML-4
│   embeddings → FAISS (per model_id) → temporal consistency     │
│   (offset voting) → ranking → unknown rejection                │
└────────────────────────────────────────────────────────────────┘
```

## Request flow: identify
1. **Upload limits** — `BodySizeLimitMiddleware` rejects bodies over
   `MUSICCHECK_MAX_UPLOAD_BYTES` (+64 KiB multipart slack) by `Content-Length` or while streaming
   (chunked), before Starlette spools them.
2. **Temp file** — `uploads.saved_upload` copies to `data/tmp/`, hashes, re-checks size, deletes
   on exit. Query audio is never persisted.
3. **Probe** — `ffprobe` with `-protocol_whitelist file -format_whitelist <allowlist>`; no audio
   stream / unknown container → 415.
4. **Decode** — `ffmpeg … -ac 1 -ar <rate> -t 30 -f f32le pipe:1` under a timeout → numpy
   float32. Rate = active provider's `sample_rate` (16 kHz validation rate when none).
5. **Gates** — duration ≥ 2 s (422 `audio_too_short`), RMS ≥ −60 dBFS (422 `audio_silent`).
6. **Provider checks** — none configured / load failed / not ready / zero indexed tracks for the
   active `model_id` → 503 `provider_unavailable` with a specific `error.code`.
7. **Recognize** — provider decides matched vs no_match itself (rejection is the provider's job).
8. **Metadata** — matched track id resolved in `tracks`; unknown id → 500 (inconsistency).

## Request flow: catalog ingest (admin)
Bearer token required (`MUSICCHECK_CATALOG_ADMIN_TOKEN`; unset → writes disabled). Unauthenticated
bodies are capped at 1 MiB so a 200 MiB upload cannot be spooled before the 401. Then: temp file
+ SHA-256 → existing hash returns 200 → probe → full decode at 16 kHz (integrity, duration,
silence) → metadata from form fields, falling back to embedded tags → copy original to
`data/catalog/audio/<sha256>.<ext>` → insert `tracks` → if a ready provider supports indexing,
index synchronously and record `track_index_entries` (ADR-0004).

## Matching strategy (to be designed in ML-3/ML-4 — not implemented)
*Hypothesis, unverified (FINDINGS H-001):* models of the NMFP / neural-audio-fp family embed
short overlapping segments (around 1 s). If so, a robust match needs more than the nearest vector: retrieve top-k
neighbours per query segment, vote on `(track_id, reference_time − query_time)` offsets, require
a minimum number of consistent segments, then apply a calibrated rejection threshold. The exact
segment length, hop, sample rate and thresholds must come from the chosen model and experiments,
not from this document. Recorded as hypotheses in `docs/agent/FINDINGS.md`.

## Configuration
All runtime settings are `MUSICCHECK_*` env vars (`services/api/README.md`). Compose reads `.env`.

## Persistence
- PostgreSQL (compose/CI) or SQLite (local default, tests). Alembic migrations in
  `services/api/alembic/versions`. A test asserts models == migrations.
- Files: `MUSICCHECK_DATA_DIR` (`/data` volume in Docker): `catalog/audio/` reference originals,
  `tmp/` transient uploads. Vector indexes will live under `index/<model_id>/` (ML-4).

## Security notes (dev stage)
- Catalog writes need a bearer token compared in constant time.
- FFmpeg only reads local temp files, with protocol and demuxer allowlists and timeouts.
- The API binds `0.0.0.0:8000` in compose so phones on the LAN can reach it — development only;
  no TLS, no rate limiting yet (backlog BE-10, M5).
