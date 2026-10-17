# ADR-0005: Build the app and API before the model, with honest unavailability

- Status: Accepted
- Date: 2026-10-17

## Context
The brief prioritises model feasibility (M0) first. On 2026-10-17 the developer asked not to work
on the AI model in that session (working on a work computer). The non-model parts of M1 (mobile
app, API, catalog, persistence, infra) could still progress.

## Decision
- Build the app/API/catalog vertically now, with **no recognition provider configured**.
- `identify` still runs the full upload → validation → FFmpeg decode path, then returns
  `503 provider_unavailable / provider_not_configured`, including the decoded `query` info. This
  lets us verify on a phone that real recordings reach the backend intact, without pretending
  to recognise anything.
- No placeholder "random match", fake embeddings or classical fingerprinting substitute was
  added. A classical baseline remains an explicitly labelled optional task (ML-8), never a
  silent replacement for the neural model.
- API paths that need a provider are tested with `StubProvider`, a test-only double that
  performs no audio analysis and is documented as such.

## Consequences
- M1 cannot be declared complete until ML-1..ML-5 land and a physical-device recognition is
  recorded.
- Model selection was not done in this session; `docs/MODEL_RESEARCH.md` contains the research
  plan only, without unverified claims.
