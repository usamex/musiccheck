# Model research

**Status: desk research done (IT-008, 2026-10-20). No model downloaded, installed or run.**
Next: licence decision (ML-1b) → feasibility experiment EXP-001 (ML-3) on a non-work machine.

Method: `deep-research` workflow (101 agents, 5 angles, 19 primary sources, 25 key claims each
checked by 3 independent verifiers → 21 confirmed, 4 refuted), plus orchestrator spot-checks of
the licences against raw files/APIs. Labels: **V** = verified by us from primary source files;
**R** = reported by the authors (self-reported, not reproduced). All accuracy numbers are **R**.

## Recommendation

| Rank | Candidate | Why | Blocker |
|---|---|---|---|
| 1 (primary) | **NMFP `nmfp-triplet`** | Only candidate with public weights *and* results on real phone/room recordings; best at every query length; maintained | Copyleft licence (GPLv3 / AGPLv3 ambiguity) — decide before adoption |
| 2 (fallback) | **Pretrained Conformer, large (26.2M)** | CC-BY-4.0 code + weights (commercial use with attribution), PyTorch, small variants | No real-recording tests, no comparison with NMFP, dormant repo |
| 3 | GraFPrint | Strong at 10 s, MIT code | Weights on HF have **no licence**; dormant |
| Research track | Fine-tune MuQ / BEATs as a fingerprinter | Promising workshop results | No released fingerprinting weights → we would train our own |

Promote the fallback to primary if NMFP's licence cannot be cleared, or if it matches NMFP on
our own phone recordings. Synthetic benchmarks overstate real-world accuracy (two independent
sources), so the decision must rest on EXP-001 with MusicCheck's own device recordings.

## Candidates

### NMFP — Neural Music Fingerprinting (primary)
- Paper: "Enhancing Neural Audio Fingerprint Robustness to Audio Degradation for Music
  Identification", ISMIR 2025 — https://arxiv.org/abs/2506.22661
- Code: https://github.com/raraz15/neural-music-fp (last push 2026-08-20, 47 stars) — **V**
- Weights: Zenodo DOI 10.5281/zenodo.15719945, "Pretrained Model Weights v1" (2025-06-23),
  fetched by `download-models.sh` — **V**:
  - `nmfp-triplet.zip` 172,872,470 B, md5 `ee8a3358fc5e5cdd09d6d2245d395021` (authors' best)
  - `nmfp-multiposcon.zip` 172,643,983 B, md5 `87abbce2fca6ba2f6a1f14d56ea17965`
- Licence — **V, inconsistent**: README says code *and* weights are "Affero GPLv3"; the `LICENSE`
  file is plain **GNU GPL v3** text (GitHub API: `GPL-3.0`); Zenodo lists the weights as
  **GPL-3.0-or-later**. See "Licensing" below.
- Stack: TensorFlow 2.13 + FAISS 1.7.4. Input **8 kHz mono only** (loader resamples; upsampling
  discouraged), 1 s segments, 0.5 s hop, log-mel 300–4000 Hz; builds on NAFP. ~200 MB unzipped.
- Results (R), track-level top-1 at 1 / 2 / 5 / 10 s:
  - Real world: 3,692 smartphone/recorder captures in bars, clubs, concert halls (with BMAT,
    private set): **63.9 / 75.0 / 82.0 / 84.6 %**. Retrained baselines: NAFP-LAMB
    42.0 / 58.6 / 71.4 / 76.3; GraFP-100ms 46.6 / 60.8 / 74.8 / 82.5.
  - Synthetic degradations, FMA database of 95,163 tracks: 86.6 / 91.7 / 94.5 / 95.6 %.
  - Caveats: authors retrained the baselines; GraFP was handicapped by 8→16 kHz upsampling;
    the lead over GraFP at 10 s (our query length) is small (84.6 vs 82.5).
- Test-database audio released 2026-08 (CSUC Dataverse) — reproducibility improved.

### Pretrained Conformers (fallback)
- Paper: Altwlkany et al., 2025 preprint — https://arxiv.org/abs/2508.11609
- Code: https://github.com/KemalAltwlkany/pretrained-conformers (7 commits, last push
  2025-09-11; `CC-BY-4.0-LICENSE.md`) — **V**
- Weights: https://zenodo.org/records/16902363, licence **CC-BY-4.0** — **V**:
  `ptc_small_1_5M_weights.pth` 6.1 MB, `ptc_medium_8_8M_weights.pth` 35.3 MB,
  `ptc_large_26_2M_weights.pth` 104.9 MB.
- Stack: PyTorch/torchaudio, use without retraining. Input 16 kHz, 128-d embedding, 3 s queries.
- Results (R), synthetic FMA (106k tracks), large model top-1: 93.9 / 97.1 / 97.8 % at
  5 / 10 / 15 dB background noise, 96.2 % under reverb, 98.2–98.7 % with ≤ ~120 ms shifts.
- Gaps: no real phone recordings, no NMFP comparison, training data undocumented; small/medium
  are weaker under severe distortion. Small (6 MB) is the most plausible on-device model.

### GraFPrint
- ICASSP 2025 (QMUL) — https://arxiv.org/abs/2410.10994; code https://github.com/chymaera96/GraFP
  (MIT, last push 2025-09-18). Weights: https://huggingface.co/chymaera96/grafp_db
  (`checkpoint.zip`, recommended `model_tc_29_best.pth`) — repo has **no licence and no model
  card**, so the weights are not usable until the author confirms terms.
- 16 kHz, 64-bin mel × 32 frames → 128-d per 1 s window, **0.1 s hop** (5× NMFP index density),
  ~18M params. R: 52.3 % at 1 s, 93.3 % at 5 s (0 dB noise+reverb, 25k-track DB).

### mimbres/neural-audio-fp (NAFP)
- ICASSP 2021 reference design — https://arxiv.org/abs/2010.11910,
  https://github.com/mimbres/neural-audio-fp (MIT code). No usable pretrained weights were
  found (NMFP authors had to retrain it); clearly weaker on real recordings. Useful as the
  blueprint for the retrieval pipeline below, not as a model.

### Foundation-model fingerprinters (research track)
- Singh et al., NeurIPS 2025 AI-for-Music workshop — https://arxiv.org/abs/2511.05399
  (R, 5,000 FMA refs, 1,000 synthetic 10 s queries, track top-1): fine-tuned MuQ 88.18 %,
  frozen MuQ + trained head 83.91 %, MERT 74.27 %, BEATs 70.27 %, GraFPrint 67.82 %,
  NAFP 63.45 %, Dejavu 49.18 %. MuQ weakest under band-/high-pass (63 / 73 %) — the
  conditions closest to phone speakers.
- Nikou & Giannakopoulos, 2025 — https://arxiv.org/abs/2507.06070,
  https://github.com/magcil/deep-audio-fingerprinting-benchmark (no licence, no weights):
  fine-tuned BEATs most robust in a 15-song laptop-mic room test (93.2 / 86.1 / 46.1 % at 10 s,
  low / mid / high noise) vs improved NAFP 76.1 / 59.3 / 37.4 %.
- Neither releases fingerprinting weights; "foundation backbones consistently win" was
  **refuted** in verification. Backbone licences (MuQ, MERT, BEATs) not yet checked.

### Not suitable as-is
- Tagging / genre / semantic-similarity embeddings (CLAP/LAION-CLAP, MusicFM, wav2vec-style,
  raw MERT/MuQ outputs): every foundation-model result needed a contrastively trained
  fingerprinting head. Use only as backbones to fine-tune. (No source tested CLAP/MusicFM for
  exact-recording ID.)
- Classical baselines (ML-8 comparison only): Olaf (https://github.com/JorenSix/Olaf) is
  AGPL-3.0 **and** its README warns about patents US7627477 B2 / US6990453. Dejavu was lowest
  (49.18 %) in Singh et al. audfprint / Panako: not verified.

## Retrieval pipeline (what ML-4 should build)
Embed overlapping segments → FAISS nearest-neighbour search → top-k per query segment →
offset-correct each hit → sum similarity per (track, offset) → best (track, offset) wins →
calibrated `no_match` threshold. Large catalogs: IVF-PQ (200 centroids, 8-bit codes) lost < 0.1 %
recall over 56M segments; 128-d ≈ 5.8 GB for 100k songs; ~1.5 s CPU (i9-10980XE) / 0.02 s GPU
search per 10 s query (R, NAFP paper). For 20–50 tracks an exact `IndexFlatIP` is enough
(our estimate: ~20k vectors, a few MB). Confirms hypothesis H-001.

## Licensing (not legal advice)
- NMFP: under plain GPLv3, serving the model over a network is not distribution; under AGPLv3
  §13, a *modified* version served over a network must offer its source to users. The README
  claims AGPL while the files say GPL — **ask the authors (UPF MTG; Sony co-authors) in writing**
  which applies and whether a commercial licence is available. Until then, plan as if AGPL:
  either open-source the recognition service or keep it isolated and unmodified. Decide in an
  ADR before adoption (ML-1b).
- Conformers: CC-BY-4.0 → commercial use allowed with attribution (credit in app/docs).
- GraFPrint weights: no licence → do not use until clarified.
- Training-data provenance of all models (FMA etc.) affects evaluation overlap (DS-2), not
  output licensing.

## Feasibility experiment EXP-001 (ML-3) — plan
0. Licence ADR first; run on a non-work machine.
1. Download `nmfp-triplet` from Zenodo, verify the md5 above, record SHA-256 → `ModelInfo`.
2. Isolated TF 2.13 + FAISS 1.7.4 environment/container (TF 2.13 likely needs Python ≤ 3.11 —
   unverified; plan a separate inference worker behind `RecognitionProvider`).
3. Decode with the existing FFmpeg path to mono 8 kHz, 1 s windows / 0.5 s hop.
4. Index ≥ 5, then 20–50 licensed references (DS-1) in `IndexFlatIP`, tagged with `model_id`.
5. Queries at 1 / 2 / 5 / 10 s: (a) clean excerpts, (b) synthetic noise/reverb/low bitrate,
   (c) **real iPhone + Android recordings** of speaker playback (quiet room, café, car,
   distance) — recorded as physical-device results, (d) unknown tracks not in the catalog.
6. Score with top-k + offset-aligned voting; compare with plain majority vote.
7. Report top-1 per condition/length, score distributions (correct vs unknown), chosen
   `no_match` threshold + false-accept rate, CPU embed + search latency per 10 s query, RAM,
   load time, index size.
8. Same harness on Conformer-large (16 kHz, 3 s windows) → primary/fallback decided on our data.
- Proposed pass bar (to agree): ≥ 90 % top-1 on real 10 s phone queries, ≤ 1 % false accepts
  on unknowns, < 2 s end-to-end CPU latency.

## Open questions
- Which licence governs NMFP, and would the authors grant a commercial licence?
- Real CPU latency / RAM / load time of nmfp-triplet and Conformer-large; ONNX/TFLite export?
- On our own 20–50-track catalog and phone recordings: does NMFP beat Conformer-large, and is
  there a threshold with acceptably low false accepts? (False-accept control matters more than
  recall for a small catalog; no source measures it.)
- Licences of MuQ / MERT / BEATs backbones; a permissive classical baseline without Olaf's
  AGPL + patent issues?

## Feasibility gate (PROMPT.md §4) — status
1 checkpoint obtained ☐ · 2 source + licence verified ◐ (sources known, licence ambiguous) ·
3 integrity ◐ (md5 published, not yet checked) · 4 loads ☐ · 5 embedding from real audio ☐ ·
6 references indexed ☐ · 7 excerpts queried ☐ · 8 correct retrieval ☐ · 9 unknown audio ☐ ·
10 requirements documented ◐ (from docs, not measured).
