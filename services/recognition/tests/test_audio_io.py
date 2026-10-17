from __future__ import annotations

import math

import numpy as np
import pytest
from musiccheck_recognition import audio as audio_io
from musiccheck_recognition.audio import InvalidAudio, UnsupportedAudioFormat


def test_probe_reports_phone_like_m4a(generated_audio):
    probe = audio_io.probe(generated_audio["query_m4a"])
    assert "mov" in probe.container.split(",")
    assert probe.codec == "aac"
    assert probe.sample_rate == 44100
    assert probe.channels == 1
    assert probe.duration_seconds == pytest.approx(6.0, abs=0.1)


def test_probe_reads_tags(generated_audio):
    probe = audio_io.probe(generated_audio["tagged_m4a"])
    assert probe.tags["title"] == "Tagged Title"
    assert probe.tags["artist"] == "Tagged Artist"
    assert probe.tags["album"] == "Tagged Album"


def test_decode_resamples_to_mono_float32(generated_audio):
    decoded = audio_io.decode(generated_audio["query_m4a"], sample_rate=16000)
    assert decoded.samples.dtype == np.float32
    assert decoded.samples.ndim == 1
    assert decoded.sample_rate == 16000
    assert decoded.duration_seconds == pytest.approx(6.0, abs=0.1)
    assert float(np.max(np.abs(decoded.samples))) <= 1.0


def test_decode_truncates_to_max_seconds(generated_audio):
    decoded = audio_io.decode(generated_audio["long_wav"], sample_rate=8000, max_seconds=30)
    assert decoded.duration_seconds == pytest.approx(30.0, abs=0.01)


@pytest.mark.parametrize("name", ["not_audio", "video_only_mp4", "empty"])
def test_probe_rejects_non_audio(generated_audio, name):
    with pytest.raises(UnsupportedAudioFormat):
        audio_io.probe(generated_audio[name])


def test_truncated_allowed_container_is_invalid_not_unsupported(generated_audio):
    # e.g. an interrupted phone recording: MP4 signature present, moov atom missing
    with pytest.raises(InvalidAudio) as excinfo:
        audio_io.probe(generated_audio["truncated_m4a"])
    assert excinfo.value.detail  # FFmpeg stderr kept for logs ...
    assert "moov" not in excinfo.value.message  # ... but not in the client message


def test_client_message_does_not_leak_paths(generated_audio):
    with pytest.raises(UnsupportedAudioFormat) as excinfo:
        audio_io.probe(generated_audio["not_audio"])
    assert str(generated_audio["not_audio"].parent) not in excinfo.value.message


def test_decode_rejects_garbage(generated_audio):
    with pytest.raises(InvalidAudio):
        audio_io.decode(generated_audio["not_audio"], sample_rate=16000)


def test_rms_dbfs():
    assert audio_io.rms_dbfs(np.zeros(1000, dtype=np.float32)) == -200.0
    assert audio_io.rms_dbfs(np.array([], dtype=np.float32)) == -200.0
    t = np.arange(16000) / 16000
    sine = np.sin(2 * math.pi * 440 * t).astype(np.float32)
    assert audio_io.rms_dbfs(sine) == pytest.approx(-3.01, abs=0.05)


def test_silence_is_far_below_default_gate(generated_audio):
    decoded = audio_io.decode(generated_audio["silence_wav"], sample_rate=16000)
    assert audio_io.rms_dbfs(decoded.samples) < -100
    music = audio_io.decode(generated_audio["query_m4a"], sample_rate=16000)
    assert audio_io.rms_dbfs(music.samples) > -30


def test_ffmpeg_version_available():
    version = audio_io.ffmpeg_version()
    assert version is not None and version.startswith("ffmpeg")
