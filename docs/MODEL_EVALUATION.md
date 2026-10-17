# Model evaluation

**Status: no results yet.** No model has been run. Never add numbers that were not produced by a
recorded experiment (`ml/experiments/EXP-NNN/` with config, command, commit, raw output).

## Methodology (define before tuning — draft, to be finalised in ML-7)

### Data splits
- **Reference catalog (dev)**: 20–50 licensed recordings (DS-1) indexed in the system.
- **Dev queries**: excerpts of dev references used for tuning thresholds/matching parameters.
- **Eval queries**: different excerpts (different offsets) and, ideally, different references
  held out from tuning. Thresholds are frozen before running eval.
- **Unknown set**: recordings *not* in the catalog (for false-positive / rejection rates).
- Document any overlap between our audio and the model's training data (MODEL_RESEARCH.md).

### Query conditions
Clean digital excerpts; phone-mic re-recordings (speaker → phone, record room/device/distance);
query lengths 3/5/10 s; positions (start/middle/end); additive noise at several SNRs; MP3/AAC
re-encoding at low bitrates; volume changes; reverberation; silence; similar recordings
(e.g. remasters/duplicates if available); invalid inputs.

### Metrics
Top-1 and top-5 accuracy (known queries); false-positive rate and correct-rejection rate
(unknown queries); accuracy vs. degradation level; model inference latency per query
(CPU, stated hardware); end-to-end HTTP latency; indexing throughput (s audio / s);
embedding storage per hour of audio; peak memory.

### Score semantics
For each provider, document here what `score` means (range, direction, how computed) and how
`score_kind` is named. `confidence` stays null until calibrated on dev data and validated on eval.

## Results
_None yet._
