# ADR-0004: Model-versioned index bookkeeping

- Status: Accepted
- Date: 2026-10-17

## Context
Embeddings from different checkpoints or preprocessing settings are incompatible. PROMPT.md §5
requires that they never be mixed, and §6 requires idempotent, resumable indexing that keeps
vector ids and metadata consistent.

## Decision
- `tracks` holds metadata + the SHA-256 and path (relative to `MUSICCHECK_DATA_DIR`) of the
  stored original reference audio, written atomically (temp file + rename). The original is kept
  so the catalog can be re-indexed for a new model.
- `track_index_entries(track_id, model_id, status, segment_count, error)` with a unique
  `(track_id, model_id)` records indexing state **per model version**. Status:
  `pending → indexing → indexed | failed`.
- `model_id = "<name>:<version>:<sha256(identity)[:12]>"` where identity covers name, version,
  checkpoint hash, sample rate, embedding dim and preprocessing params (`ModelInfo.model_id`).
- `ModelInfo.checkpoint_sha256` is optional in the type (external services have none), but a
  self-hosted provider **must** set it, otherwise `model_id` does not pin the weights.
- Only entries whose `model_id` equals the active provider's count as indexed (API `indexing`
  field, `/ready`, `catalog_empty`). Provider-side vector stores must be partitioned by
  `model_id` too (e.g. one FAISS index file per model_id) and refuse to load a mismatched one.
- Ingestion is idempotent on audio SHA-256 (same bytes → same track, HTTP 200).
- A provider returning a track id unknown to the DB is reported as an internal error.

## Consequences
- Switching models = set the new provider, run the re-index job (backlog BE-7); old entries stay
  for rollback.
- Interrupted indexing leaves `indexing` rows; BE-7 must treat stale `indexing` as retryable.
- Index/DB reconciliation at startup is backlog BE-8.
