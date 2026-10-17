"""Value types shared by the recognition engine and the API.

These types are the stable boundary between application infrastructure (services/api)
and model implementations (providers). Nothing here depends on a specific model.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import StrEnum

import numpy as np


class ProviderKind(StrEnum):
    """Who performs the recognition. Must be surfaced to users (see docs/API.md)."""

    SELF_HOSTED_MODEL = "self_hosted_model"
    EXTERNAL_SERVICE = "external_service"


class Decision(StrEnum):
    MATCHED = "matched"
    NO_MATCH = "no_match"


@dataclass(frozen=True)
class AudioProbe:
    """Container/stream facts reported by ffprobe for an uploaded file."""

    container: str
    codec: str | None
    sample_rate: int | None
    channels: int | None
    duration_seconds: float | None
    tags: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class DecodedAudio:
    """Mono float32 PCM in [-1, 1] at ``sample_rate``."""

    samples: np.ndarray
    sample_rate: int

    @property
    def duration_seconds(self) -> float:
        return float(len(self.samples)) / float(self.sample_rate)


@dataclass(frozen=True)
class ModelInfo:
    """Identity of the model + preprocessing that produced an index.

    ``model_id`` is derived from every field that affects embeddings, so two indexes are
    compatible only if their model_id matches (ADR-0004).
    """

    name: str
    version: str
    checkpoint_sha256: str | None
    sample_rate: int
    embedding_dim: int | None
    preprocessing: dict[str, object] = field(default_factory=dict)
    license: str | None = None
    source_url: str | None = None

    @property
    def model_id(self) -> str:
        identity = {
            "name": self.name,
            "version": self.version,
            "checkpoint_sha256": self.checkpoint_sha256,
            "sample_rate": self.sample_rate,
            "embedding_dim": self.embedding_dim,
            "preprocessing": self.preprocessing,
        }
        digest = hashlib.sha256(
            json.dumps(identity, sort_keys=True, default=str).encode()
        ).hexdigest()[:12]
        return f"{self.name}:{self.version}:{digest}"


@dataclass(frozen=True)
class ProviderStatus:
    ready: bool
    detail: str | None = None


@dataclass(frozen=True)
class Candidate:
    track_id: str
    score: float
    offset_seconds: float | None = None


@dataclass(frozen=True)
class Recognition:
    """Outcome of one recognition request.

    ``score`` semantics are provider-specific and described by ``score_kind``.
    ``confidence`` must stay None until a calibration experiment justifies a value.
    """

    decision: Decision
    candidates: tuple[Candidate, ...]
    score_kind: str
    confidence: float | None = None

    @property
    def best(self) -> Candidate | None:
        return self.candidates[0] if self.candidates else None


@dataclass(frozen=True)
class IndexReport:
    track_id: str
    model_id: str
    segment_count: int
