"""MusicCheck recognition engine: provider interface, audio I/O, provider registry."""

from .provider import RecognitionProvider
from .types import (
    AudioProbe,
    Candidate,
    Decision,
    DecodedAudio,
    IndexReport,
    ModelInfo,
    ProviderKind,
    ProviderStatus,
    Recognition,
)

__all__ = [
    "AudioProbe",
    "Candidate",
    "Decision",
    "DecodedAudio",
    "IndexReport",
    "ModelInfo",
    "ProviderKind",
    "ProviderStatus",
    "Recognition",
    "RecognitionProvider",
]
