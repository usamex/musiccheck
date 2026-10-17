# API Contract (v1)

Status: **implemented** in `services/api` (see `docs/agent/STATE.md` for what is verified).
The machine-readable contract is `packages/shared/openapi.json`, exported from the
FastAPI app by `scripts/export-openapi.sh`. CI fails if the committed file drifts.

Base URL (local dev): `http://<host>:8000`. All bodies are JSON unless noted.

---

## Recognition

### `POST /v1/recognition/identify`

Identify a short recording against the configured recognition provider.

**Request:** `multipart/form-data`

| Field    | Type   | Required | Notes |
|----------|--------|----------|-------|
| `audio`  | file   | yes      | Any container FFmpeg can demux from the allowlist (m4a/mp4/AAC, wav, mp3, ogg/opus, webm, flac, 3gp/amr). Mobile app sends AAC in `.m4a`. |
| `source` | string | no       | `microphone` (default) or `file` (developer file picker). Any other value → 422 `invalid_request`. Informational only. |

**Limits** (env-configurable, see `services/api/README.md`):

- Upload size ≤ `MUSICCHECK_MAX_UPLOAD_BYTES` (default 10 MiB).
- Decoded duration ≥ `MUSICCHECK_MIN_QUERY_SECONDS` (default 2.0 s).
- Only the first `MUSICCHECK_MAX_QUERY_SECONDS` (default 30 s) are analysed; longer audio is truncated, not rejected.
- Audio whose RMS level is below `MUSICCHECK_SILENCE_DBFS` (default −60 dBFS; a heuristic gate, not yet calibrated with phone recordings) is rejected as silent.
- FFmpeg decode is time-limited (`MUSICCHECK_DECODE_TIMEOUT_SECONDS`, default 15 s).
- Query audio is processed in a temporary file and deleted after the request. **It is never stored.**

**Response:** always a `RecognitionResponse`, whatever the HTTP status — including 413s from the
body-size middleware, request-validation errors and unhandled exceptions (then `status: "error"`,
`processing_ms: 0`, and fields not known at that point are null):

```json
{
  "request_id": "req_7f3c9a1b2d4e4f60",
  "status": "matched",
  "provider": "neural",
  "provider_kind": "self_hosted_model",
  "model_id": "nmfp-triplet:...",
  "track": {
    "id": "trk_01hf...",
    "title": "Example Song",
    "artist": "Example Artist",
    "album": "Example Album",
    "duration_seconds": 215.3,
    "artwork_url": null
  },
  "score": 0.91,
  "score_kind": "provider-specific; see Score semantics",
  "confidence": null,
  "matched_offset_seconds": 42.5,
  "query": {
    "duration_seconds": 9.98,
    "analyzed_seconds": 9.98,
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "codec": "aac",
    "sample_rate": 44100,
    "channels": 1
  },
  "error": null,
  "processing_ms": 412
}
```

**Outcomes** (`status` field ↔ HTTP status):

| `status`               | HTTP | `error.code` values | Meaning |
|------------------------|------|---------------------|---------|
| `matched`              | 200  | –                   | Provider identified a track with score above its calibrated threshold. `track` is set. |
| `no_match`             | 200  | –                   | Audio was valid and searched; nothing passed the rejection threshold. `track` is null. |
| `invalid_input`        | 400  | `missing_audio`, `empty_audio`, `invalid_request` | Request is malformed (e.g. broken multipart). |
| `invalid_input`        | 413  | `payload_too_large` | Upload exceeds the size limit. |
| `invalid_input`        | 415  | `unsupported_audio_format` | Not a recognised/allowed container, or no audio stream. |
| `invalid_input`        | 422  | `invalid_audio`, `audio_too_short`, `audio_silent`, `invalid_request` | File looks like an allowed container (magic bytes) but is corrupt/truncated or cannot be decoded; too short; (near-)silent; or a form field failed validation. |
| `provider_unavailable` | 503  | `provider_not_configured`, `provider_not_ready`, `catalog_empty` | No recognition engine is usable right now. Audio was still validated; `query` is populated. |
| `error`                | 500  | `internal_error`    | Unexpected failure. `request_id` is logged server-side. |
| `error`                | 504  | `processing_timeout`| Decoding or recognition exceeded its time budget. |

Clients must branch on `status` (and `error.code` for UX copy), never on HTTP status alone.
`error.message` is human-readable and safe to show; it never contains FFmpeg output, file paths or
exception text (those go to server logs under the `request_id`).

#### Score semantics

- `score` is a **provider-specific similarity/match-strength value**, not a probability.
  Its range and meaning are given by `score_kind` and documented per provider in
  `docs/MODEL_EVALUATION.md` once a provider exists. Do not display it as a percentage.
- `confidence` is a **calibrated probability of correctness in [0, 1]** and is `null`
  until a calibration experiment (backlog `ML-6`) has produced one. The API never
  fabricates confidence.
- `matched_offset_seconds` is the estimated position of the query start inside the
  reference recording, when the provider can estimate it.
- `provider` / `provider_kind` distinguish our own model (`self_hosted_model`) from
  external services (`external_service`, e.g. ACRCloud). The app must label results
  accordingly.

---

## Catalog

Write endpoints require `Authorization: Bearer <MUSICCHECK_CATALOG_ADMIN_TOKEN>`.
If the token is not configured on the server, write endpoints return 503 (`catalog_admin_disabled`).
Read endpoints are public.

### `POST /v1/catalog/tracks` (admin)

Ingest a reference recording. `multipart/form-data`:

| Field          | Required | Notes |
|----------------|----------|-------|
| `audio`        | yes      | Full reference recording. Max `MUSICCHECK_MAX_REFERENCE_UPLOAD_BYTES` (default 200 MiB). |
| `title`        | no*      | Falls back to the file's embedded tag. *Required if no tag. |
| `artist`       | no*      | Falls back to the file's embedded tag. *Required if no tag. |
| `album`        | no       | Falls back to embedded tag. |
| `recording_id` | no       | External identifier (ISRC, MusicBrainz recording MBID, dataset id like `fma:000002`). |
| `source`       | no       | Dataset or origin name (e.g. `fma_small`). |
| `license`      | no       | License of this audio file (e.g. `CC-BY-4.0`). Required for anything beyond local testing — see `docs/DATASETS.md`. |
| `artwork_url`  | no       | Only if we are authorized to display it. |

Behaviour:

1. Validate and probe the audio (same allowlist/limits as identify, larger size cap).
2. Compute SHA-256 of the uploaded bytes. **Idempotent:** if a track with that hash exists,
   return it with HTTP **200** (no duplicate is created). New tracks return **201**.
3. Store the original file under `MUSICCHECK_DATA_DIR/catalog/audio/<sha256><ext>` (kept so the
   catalog can be re-indexed when the model changes).
4. If a recognition provider that supports indexing is ready, index synchronously and set
   indexing status to `indexed` / `failed`. Otherwise the track stays `pending` and is picked up
   later by `scripts/reindex` (backlog `BE-7`).

Response: `Track` (below). Errors use `{"error": {"code", "message"}, "request_id"}`:
400 `missing_audio`/`empty_audio`, 401 `unauthorized`, 413 `payload_too_large`,
415 `unsupported_audio_format`, 422 `invalid_audio`/`audio_too_short`/`audio_too_long`/
`audio_silent`/`missing_metadata`/`invalid_request`, 500 `internal_error`, 503
`catalog_admin_disabled`, 504 `processing_timeout`. `audio_too_long` is judged on the *decoded*
length, not the container header.

Unauthenticated (or wrong-token) uploads are cut off at 1 MiB with 413 before the token is
checked, so large uploads never get spooled; when writes are disabled entirely, a large upload
therefore sees 413 rather than 503.

### `GET /v1/catalog/tracks/{track_id}`

Returns a `Track` or 404 `track_not_found`.

### `GET /v1/catalog/tracks?limit=50&offset=0`

Returns `{"items": [Track], "total": int, "limit": int, "offset": int}` ordered by creation time.

### `DELETE /v1/catalog/tracks/{track_id}` (admin)

Removes the track from the **active** provider's index (if it supports indexing), deletes the
metadata row (and its index entries) and the stored audio file. Returns 204, 404
`track_not_found`, or 503 `provider_unavailable` when a provider is configured but not loaded/ready
(deleting then would leave stale vectors behind). Vectors in indexes of inactive model versions
are reconciled later (backlog BE-8).

### `Track`

```json
{
  "id": "trk_01hf...",
  "title": "Example Song",
  "artist": "Example Artist",
  "album": null,
  "duration_seconds": 215.3,
  "artwork_url": null,
  "recording_id": "fma:000002",
  "source": "fma_small",
  "license": "CC-BY-4.0",
  "audio_sha256": "…64 hex…",
  "created_at": "2026-10-17T20:00:00Z",
  "indexing": {
    "status": "pending",
    "model_id": null,
    "segment_count": null,
    "error": null,
    "updated_at": null
  }
}
```

`indexing` describes the track's state **for the currently active provider/model**.
`status ∈ {pending, indexing, indexed, failed}`. Entries for other model versions are kept in
the database but never mixed into the active index (see ADR-0004). The stored file path is
relative to `MUSICCHECK_DATA_DIR` and not exposed.

---

## Operations

### `GET /health`

Liveness. `200 {"status": "ok", "service": "musiccheck-api", "version": "0.1.0"}`.
Does not touch the database or model.

### `GET /ready`

Readiness. `200` only if every check passes, otherwise `503`. Body:

```json
{
  "ready": false,
  "checks": {
    "database":    {"ok": true,  "detail": null},
    "ffmpeg":      {"ok": true,  "detail": "ffmpeg 7.1.1"},
    "recognition": {"ok": false, "detail": "No recognition provider configured (MUSICCHECK_RECOGNITION_PROVIDER=none)"},
    "catalog":     {"ok": false, "detail": "No active model"}
  },
  "provider": null
}
```
With a provider, `catalog.detail` is `"<n> tracks indexed for active model"`. Details never include
raw exception text (see server logs).

`provider` (when configured) is `{"id", "kind", "model_id", "ready", "detail"}`.

---

## Error envelope for non-recognition endpoints

```json
{"request_id": "req_…", "error": {"code": "track_not_found", "message": "…"}}
```

Every response carries an `X-Request-ID` header (echoed from the request if the client sent one).
