"""Deterministic test audio generated with FFmpeg at test time (nothing binary is committed).

These are synthetic signals for validating the audio pipeline and API plumbing. They are NOT
music and must never be used to judge recognition accuracy (see docs/MODEL_EVALUATION.md).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

# A chord with a little noise: non-silent, broadband enough to look like real input.
_MUSICLIKE = (
    "sine=frequency=220:sample_rate=44100,volume=0.3[a];"
    "sine=frequency=330:sample_rate=44100,volume=0.2[b];"
    "anoisesrc=color=pink:amplitude=0.05:sample_rate=44100:seed=7[c];"
    "[a][b][c]amix=inputs=3:normalize=0"
)


def _ffmpeg(*args: str) -> None:
    subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *args], check=True
    )


def _lavfi(out: Path, graph: str, seconds: float, *codec: str) -> Path:
    _ffmpeg("-f", "lavfi", "-t", str(seconds), "-i", graph, "-ac", "1", *codec, str(out))
    return out


@pytest.fixture(scope="session")
def generated_audio(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    d = tmp_path_factory.mktemp("audio")
    aac = ("-c:a", "aac", "-b:a", "128k", "-ar", "44100")
    files: dict[str, Path] = {}
    # What expo-audio produces on a phone: AAC-LC, mono, 44.1 kHz, in an MPEG-4 container.
    files["query_m4a"] = _lavfi(d / "query.m4a", _MUSICLIKE, 6, *aac)
    files["query_wav"] = _lavfi(d / "query.wav", _MUSICLIKE, 6, "-c:a", "pcm_s16le")
    files["long_wav"] = _lavfi(d / "long.wav", _MUSICLIKE, 45, "-c:a", "pcm_s16le")
    files["short_m4a"] = _lavfi(d / "short.m4a", _MUSICLIKE, 1, *aac)
    files["silence_wav"] = _lavfi(
        d / "silence.wav", "anullsrc=channel_layout=mono:sample_rate=44100", 5, "-c:a", "pcm_s16le"
    )
    files["reference_a_m4a"] = _lavfi(
        d / "ref_a.m4a", _MUSICLIKE.replace("seed=7", "seed=11"), 12, *aac
    )
    tagged = d / "tagged.m4a"
    _ffmpeg(
        "-f", "lavfi", "-t", "8", "-i", _MUSICLIKE.replace("seed=7", "seed=21"),
        "-ac", "1", *aac,
        "-metadata", "title=Tagged Title", "-metadata", "artist=Tagged Artist",
        "-metadata", "album=Tagged Album", str(tagged),
    )  # fmt: skip
    files["tagged_m4a"] = tagged
    video = d / "video_only.mp4"
    _ffmpeg(
        "-f", "lavfi", "-t", "2", "-i", "testsrc=size=64x64:rate=10", "-c:v", "mpeg4", str(video)
    )
    files["video_only_mp4"] = video

    not_audio = d / "not_audio.m4a"
    not_audio.write_bytes(b"this is definitely not an audio file\n" * 50)
    files["not_audio"] = not_audio
    truncated = d / "truncated.m4a"
    truncated.write_bytes(files["query_m4a"].read_bytes()[:2048])
    files["truncated_m4a"] = truncated
    empty = d / "empty.m4a"
    empty.write_bytes(b"")
    files["empty"] = empty
    return files
