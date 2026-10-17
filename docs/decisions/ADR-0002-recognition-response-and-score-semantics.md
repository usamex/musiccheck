# ADR-0002: Recognition response contract and score semantics

- Status: Accepted
- Date: 2026-10-17

## Context
PROMPT.md §9 requires explicit outcomes (match, no match, invalid input, provider unavailable,
internal error) and warns against confusing similarity with probability.

## Decision
- `POST /v1/recognition/identify` always returns the same `RecognitionResponse` body, with a
  `status` enum `matched | no_match | invalid_input | provider_unavailable | error` and an
  `error.code` for UX copy. HTTP status mirrors the outcome (200/400/413/415/422/503/500/504) but
  clients branch on `status`. Full table: `docs/API.md`.
- `score` is a provider-specific match strength described by `score_kind`. It is **not** a
  probability and must not be shown as a percentage.
- `confidence` is a calibrated probability and is `null` until an experiment (backlog ML-6)
  produces a calibration. Product code never fabricates it.
- `provider` + `provider_kind` (`self_hosted_model` | `external_service`) distinguish our model
  from third-party services; the app labels results accordingly.
- `query` echoes what the server decoded (container, codec, sample rate, channels, duration).
  This is how we verify that phone recordings arrive intact.
- `no_match` is a normal 200 outcome. An index/metadata inconsistency is a 500, never a silent
  `no_match` or a wrong match.

## Consequences
- The mobile app has one parsing path and can show precise error states.
- Adding providers or calibration later does not change the contract.
