# ADR-0003: Recognition provider abstraction

- Status: Accepted
- Date: 2026-10-17

## Context
The neural model is not chosen yet (M0), external services (ACRCloud, AudD, ShazamKit) may be
added later, and a classical fingerprint baseline may be useful for comparison. The API must not
change when engines change (PROMPT.md §5, §7).

## Decision
`musiccheck_recognition.provider.RecognitionProvider` (abstract base class):

| Member | Purpose |
|---|---|
| `id`, `kind` | Stable provider id returned to clients; `self_hosted_model` or `external_service`. |
| `status()` | Ready? (model loaded, credentials valid). Drives `/ready` and 503s. |
| `model_info()` | `ModelInfo` (name, version, checkpoint SHA-256, sample rate, embedding dim, preprocessing params, license, source). `model_id` is a hash of everything that affects embeddings. |
| `sample_rate` | Rate the API decodes audio to before calling the provider. |
| `recognize(DecodedAudio) -> Recognition` | Decision (`matched`/`no_match`), ranked candidates (track id, score, offset), `score_kind`, optional calibrated `confidence`. Must reject weak nearest neighbours itself. |
| `supports_indexing`, `index_track`, `remove_track` | Catalog management for self-hosted engines. External services return `supports_indexing = False`. |
| `close()` | Release resources. |

Providers are created by name from `MUSICCHECK_RECOGNITION_PROVIDER` via
`registry.create_provider`. `none` is the only value today. An unknown name aborts startup (config
error); a provider that fails to load (e.g. missing checkpoint) leaves the API up but not ready.

The API owns: upload limits, FFmpeg validation/decoding, silence/length gates, metadata DB,
index bookkeeping. The provider owns: model-specific preprocessing, embeddings, vector index,
temporal matching, rejection.

Concurrency: the API runs sync endpoints in a thread pool, so `recognize`, `index_track` and
`remove_track` may be called concurrently. Providers must be thread-safe (or lock internally);
bounding inference concurrency is backlog BE-9.

## Consequences
- The neural provider (backlog ML-4) is a new class + one registry line; no API changes.
- External services will be separate providers clearly labelled `external_service`. A fallback
  chain (own model first, external on `no_match`) would be a composite provider (M4).
- Provider-native mobile SDKs (ShazamKit) cannot fit this server-side interface and would be a
  client-side path; to be evaluated in M4.
