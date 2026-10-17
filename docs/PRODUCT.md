# Product

## One-liner
Tap a button, let the phone listen to music for ~10 seconds, see which song it is — identified
by our own neural audio-fingerprinting model against **our indexed catalog**.

## Initial scope (M1–M2)
- Exact recording identification (the same master recording, played through a speaker and
  captured by a phone mic). Not covers, live versions, humming or singing.
- Explicit tap-to-recognise. No background listening.
- No accounts. Recognition history is stored on the device only.
- The catalog is small (target 20–50 legally usable recordings). The app must say so: it
  recognises "songs in our catalog", not "any song".

## App states
`IDLE → LISTENING → PROCESSING → MATCH_FOUND | NO_MATCH | ERROR`, with cancel from LISTENING and
PROCESSING. Error kinds: microphone permission denied, microphone unavailable, network
unavailable, backend unavailable, unsupported audio format, invalid recording (silent/too short),
model unavailable, request timeout.

## Screens
Home (one big identify button + status), Result (title, artist, album, artwork if licensed,
provider label, calibrated confidence only when it exists), No-match, Error (specific recovery
action), History (local list, reopen a result).

## Honesty requirements
- Never show a result that did not come from the recognition pipeline.
- Never present similarity scores as percentages/probabilities.
- Label who identified the song: our model vs. an external service (if one is ever added).

## Privacy
- Query recordings are uploaded, decoded in a temp file and deleted after the request. They are
  not stored or logged. (Server logs hold request id, outcome and timing only.)
- History lives only on the device.

## Later (M3–M6, see PROMPT.md §16)
Accuracy/latency benchmarking, larger catalogs, optional external providers for real-world
coverage, deployable builds, then query-by-humming/singing, cover detection, on-device inference.
