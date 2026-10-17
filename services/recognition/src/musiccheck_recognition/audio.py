"""Audio probing and decoding via FFmpeg.

Untrusted uploads are only ever read from a local temp file with the ``file`` protocol and a
fixed demuxer allowlist, under a subprocess timeout. Decoding produces mono float32 PCM at the
sample rate requested by the active provider; model-specific normalisation happens in the
provider, not here.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path

import numpy as np

from .types import AudioProbe, DecodedAudio

# Demuxers we accept. Covers what iOS/Android recorders, browsers and common reference files
# produce. Passed to FFmpeg as -format_whitelist so other demuxers are never even probed.
ALLOWED_DEMUXERS: tuple[str, ...] = (
    "mov",  # mov,mp4,m4a,3gp,3g2,mj2 — AAC in .m4a from expo-audio on iOS and Android
    "wav",
    "mp3",
    "ogg",
    "matroska",  # matroska,webm — browser MediaRecorder
    "flac",
    "aac",  # raw ADTS
    "amr",
    "caf",
    "aiff",
)
_FORMAT_WHITELIST = ",".join(ALLOWED_DEMUXERS)
_STDERR_TAIL = 500

# File signatures of the allowed containers. A file that carries one of these but fails to probe
# is corrupt/truncated (422 invalid_audio), not an unsupported format (415).
_SIGNATURES: tuple[tuple[int, bytes], ...] = (
    (4, b"ftyp"),  # MPEG-4 / 3GP / M4A
    (4, b"moov"),
    (4, b"mdat"),
    (4, b"wide"),
    (4, b"free"),
    (0, b"RIFF"),  # WAV
    (0, b"RF64"),
    (0, b"ID3"),  # MP3 with ID3v2
    (0, b"OggS"),
    (0, b"\x1a\x45\xdf\xa3"),  # Matroska / WebM (EBML)
    (0, b"fLaC"),
    (0, b"#!AMR"),
    (0, b"caff"),
    (0, b"FORM"),  # AIFF
)


def looks_like_allowed_container(path: Path) -> bool:
    """Cheap magic-byte sniff (also accepts MPEG audio / ADTS frame sync)."""
    try:
        with path.open("rb") as handle:
            head = handle.read(16)
    except OSError:
        return False
    if any(head[offset : offset + len(sig)] == sig for offset, sig in _SIGNATURES):
        return True
    # MPEG audio frame sync (MP3 without ID3) or ADTS AAC: 11/12 set bits.
    return len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0


def _tail(stderr: bytes) -> str:
    return stderr.decode(errors="replace").strip()[-_STDERR_TAIL:]


class AudioError(Exception):
    """Base class; ``code`` maps onto the API's ``error.code``.

    ``message`` is safe to return to clients. ``detail`` (FFmpeg stderr: paths, addresses) is for
    server logs only.
    """

    code = "invalid_audio"

    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message)
        self.message = message
        self.detail = detail


class UnsupportedAudioFormat(AudioError):
    code = "unsupported_audio_format"


class InvalidAudio(AudioError):
    code = "invalid_audio"


class AudioProcessingTimeout(AudioError):
    code = "processing_timeout"


class FfmpegNotFound(AudioError):
    code = "internal_error"


def _require(binary: str) -> str:
    path = shutil.which(binary)
    if path is None:
        raise FfmpegNotFound(f"{binary} not found on PATH")
    return path


def ffmpeg_version() -> str | None:
    """Return e.g. ``"ffmpeg 7.1.1"`` or None if FFmpeg is unavailable."""
    try:
        out = subprocess.run(
            [_require("ffmpeg"), "-hide_banner", "-version"],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        ).stdout
    except (AudioError, subprocess.SubprocessError, OSError):
        return None
    first = out.splitlines()[0] if out else ""
    parts = first.split()
    return f"ffmpeg {parts[2]}" if len(parts) >= 3 else first or None


def probe(path: Path, *, timeout: float = 10.0) -> AudioProbe:
    """Inspect ``path`` and return facts about its first audio stream.

    Raises UnsupportedAudioFormat if the file is not an allowed container or has no audio, and
    InvalidAudio if it looks like an allowed container but cannot be parsed (truncated/corrupt).
    """
    cmd = [
        _require("ffprobe"),
        "-v", "error",
        "-hide_banner",
        "-protocol_whitelist", "file",
        "-format_whitelist", _FORMAT_WHITELIST,
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        "-i", str(path),
    ]  # fmt: skip
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise AudioProcessingTimeout("Probing the audio file timed out") from exc
    if proc.returncode != 0:
        detail = _tail(proc.stderr)
        if "not on whitelist" not in detail and looks_like_allowed_container(path):
            raise InvalidAudio("The audio file is corrupt or incomplete", detail)
        raise UnsupportedAudioFormat("File is not a supported audio format", detail)
    try:
        info = json.loads(proc.stdout.decode(errors="replace") or "{}")
    except json.JSONDecodeError as exc:
        raise UnsupportedAudioFormat("Could not read audio metadata") from exc

    fmt = info.get("format") or {}
    audio_streams = [s for s in info.get("streams") or [] if s.get("codec_type") == "audio"]
    if not audio_streams:
        raise UnsupportedAudioFormat("File contains no audio stream")
    stream = audio_streams[0]

    tags: dict[str, str] = {}
    for source in (stream.get("tags") or {}, fmt.get("tags") or {}):
        for key, value in source.items():
            if isinstance(value, str) and value.strip():
                tags.setdefault(key.lower(), value.strip())

    return AudioProbe(
        container=str(fmt.get("format_name") or "unknown"),
        codec=stream.get("codec_name"),
        sample_rate=_to_int(stream.get("sample_rate")),
        channels=_to_int(stream.get("channels")),
        duration_seconds=_to_float(fmt.get("duration")) or _to_float(stream.get("duration")),
        tags=tags,
    )


def decode(
    path: Path,
    *,
    sample_rate: int,
    max_seconds: float | None = None,
    timeout: float = 15.0,
) -> DecodedAudio:
    """Decode the first audio stream of ``path`` to mono float32 PCM at ``sample_rate``.

    Only the first ``max_seconds`` are decoded when given.
    """
    cmd = [
        _require("ffmpeg"),
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        "-protocol_whitelist", "file",
        "-format_whitelist", _FORMAT_WHITELIST,
        "-i", str(path),
        "-map", "0:a:0",
        "-vn", "-sn", "-dn",
        "-ac", "1",
        "-ar", str(sample_rate),
    ]  # fmt: skip
    if max_seconds is not None:
        cmd += ["-t", f"{max_seconds:.3f}"]
    cmd += ["-f", "f32le", "pipe:1"]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise AudioProcessingTimeout("Decoding the audio timed out") from exc
    if proc.returncode != 0:
        raise InvalidAudio("The audio could not be decoded", _tail(proc.stderr))

    usable = len(proc.stdout) - (len(proc.stdout) % 4)
    raw = np.frombuffer(proc.stdout, dtype="<f4", count=usable // 4)
    if raw.size == 0:
        raise InvalidAudio("No audio samples could be decoded")
    if not np.all(np.isfinite(raw)):
        raise InvalidAudio("Decoded audio contains invalid samples")
    # np.clip allocates the one writable float32 copy we keep; ``raw`` is a view of stdout.
    samples = np.clip(raw, -1.0, 1.0).astype(np.float32, copy=False)
    return DecodedAudio(samples=samples, sample_rate=sample_rate)


def rms_dbfs(samples: np.ndarray) -> float:
    """Root-mean-square level in dBFS (0 dBFS = full-scale square wave). Floor at -200."""
    if samples.size == 0:
        return -200.0
    # Chunked to bound temporary memory on long references; accumulate in float64.
    total = 0.0
    for start in range(0, samples.size, 1 << 20):
        chunk = samples[start : start + (1 << 20)]
        total += float(np.dot(chunk, chunk))
    rms = math.sqrt(total / samples.size)
    return 20.0 * math.log10(max(rms, 1e-10))


def _to_int(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _to_float(value: object) -> float | None:
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None
