# Datasets and reference audio

**Status: no dataset selected or downloaded.** Backlog DS-1.

## Rules
- Audio files are never committed to git (`.gitignore` covers `data/`, `ml/data/`, `ml/models/*`).
  Commit *manifests* (ids, source URLs, licenses, checksums) and download scripts instead.
- Verify the license of **each audio file**, not just the dataset's documentation. Record it in
  the `license` field when ingesting (`POST /v1/catalog/tracks`).
- Research datasets are not automatically redistributable or usable commercially. Note the
  allowed use (research / non-commercial / commercial) per source.
- Personal recordings made for testing (phone captures) are test artefacts: keep them out of git
  unless they contain only licensed audio and no voices/personal data.

## Candidates to investigate
| Source | What to verify | Status |
|---|---|---|
| FMA (Free Music Archive dataset, e.g. `fma_small`) | Per-track licenses (mixed CC variants incl. NC/ND), redistribution terms of the dataset itself, metadata quality | Not checked |
| Other CC/public-domain catalogs (e.g. Musopen, ccMixter, Jamendo CC subsets) | Per-track license, API/download terms | Not checked |
| Commercially licensed catalog | Cost/terms — only for M4 | Out of scope now |

## Test fixtures in this repo
`tests/fixtures/audio.py` synthesises signals with FFmpeg (sine chords + pink noise, silence,
corrupt files). They validate the audio pipeline and API only. They are **not music** and must
not be used to judge recognition accuracy.
