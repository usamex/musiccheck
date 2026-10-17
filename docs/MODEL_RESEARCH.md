# Model research

**Status: NOT STARTED.** Model work was intentionally deferred in session 1 (2026-10-17) at the
developer's request. Nothing below is a verified finding. Next step: backlog ML-1 / ML-2.

Rule: every claim added here needs a source (URL + date accessed, or experiment id
`EXP-NNN` in `ml/experiments/`). Mark claims **Verified** (we downloaded/ran/read the license
file ourselves) or **Reported** (stated by a paper/README, not yet checked).

## Candidates to evaluate

| Candidate | Source | Status |
|---|---|---|
| NMFP (`nmfp-triplet` and variants) — "Enhancing Neural Audio Fingerprint Robustness to Audio Degradation for Music Identification", ISMIR 2025 | https://github.com/raraz15/neural-music-fp | Not evaluated. Preferred candidate per brief. Brief states AGPLv3 implications — to verify. |
| neural-audio-fp (contrastive neural audio fingerprinting) | https://github.com/mimbres/neural-audio-fp | Not evaluated. |
| Newer neural music-identification models with public weights | literature search | Not searched. |
| Classical landmark fingerprinting (baseline only, ADR-0005) | e.g. Wang 2003 style | Optional comparison (ML-8); must never silently replace the neural model. |

## Evaluation checklist (fill one table per candidate)

| Question | Finding | Evidence |
|---|---|---|
| Are pretrained weights downloadable? From where? Checksums published? | | |
| License of code / of weights / of training data; AGPL network-use implications for a hosted API; commercial use | | |
| Framework + versions (TF/PyTorch), Python version constraints | | |
| Input: sample rate, channels, segment length, hop, features (e.g. log-mel params) | | |
| Output: embedding dimension, normalisation, similarity metric | | |
| Pretrained inference reproduced on our machine? | | EXP-… |
| CPU latency per second of audio; GPU required? Memory footprint | | EXP-… |
| Retrieval method in the paper (FAISS index type, sequence search) | | |
| Reported robustness (noise, reverb, mic, compression) and on which data | | |
| Training data (to assess overlap with our evaluation set) | | |
| Deployment complexity (export to ONNX/TFLite? on-device later?) | | |

## AGPLv3 notes (to research, not legal advice)
Questions to answer with the actual license texts: whether the weights are AGPL-licensed or
under a separate license; whether running the model behind our API triggers AGPL §13 (network
interaction) source-offer obligations for our server code; what that means for a closed-source
deployment; whether a clean-room re-implementation trained by us is an option. Record the answer
and its consequences in a new ADR before committing to the model.

## Feasibility gate (PROMPT.md §4) — all must be checked with evidence
1. Real checkpoint obtained · 2. Source + license verified · 3. Integrity verified (if checksums)
· 4. Model loads · 5. Embedding from real audio · 6. Several references indexed · 7. Different
excerpts queried · 8. Correct track retrieved · 9. Unknown audio tested · 10. Inference
requirements documented.
