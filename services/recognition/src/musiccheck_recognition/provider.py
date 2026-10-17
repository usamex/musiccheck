"""The recognition provider interface (ADR-0003).

Every recognition backend — our own neural model, a classical baseline, or an external
service such as ACRCloud — implements :class:`RecognitionProvider`. The API only talks to
this interface, so swapping or adding models never touches HTTP, persistence or the app.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .types import DecodedAudio, IndexReport, ModelInfo, ProviderKind, ProviderStatus, Recognition


class RecognitionProvider(ABC):
    #: Stable identifier returned to clients as ``provider`` (e.g. "neural", "acrcloud").
    id: str
    kind: ProviderKind

    @abstractmethod
    def status(self) -> ProviderStatus:
        """Whether the provider can serve requests right now (model loaded, credentials ok…)."""

    @abstractmethod
    def model_info(self) -> ModelInfo | None:
        """Identity of the active model, or None for external services without one."""

    @property
    def sample_rate(self) -> int:
        """Sample rate the provider expects for :meth:`recognize` / :meth:`index_track`."""
        info = self.model_info()
        if info is None:
            raise NotImplementedError(f"{type(self).__name__} must define sample_rate")
        return info.sample_rate

    @property
    def supports_indexing(self) -> bool:
        """External catalog services return False: we cannot add tracks to them."""
        return False

    @abstractmethod
    def recognize(self, audio: DecodedAudio) -> Recognition:
        """Identify ``audio``. Must return NO_MATCH rather than a weak nearest neighbour."""

    def index_track(self, track_id: str, audio: DecodedAudio) -> IndexReport:
        """Add (or idempotently replace) a reference recording in the provider's index."""
        raise NotImplementedError(f"{type(self).__name__} does not support indexing")

    def remove_track(self, track_id: str) -> None:
        """Remove a reference recording from the index. Unknown ids are a no-op."""
        raise NotImplementedError(f"{type(self).__name__} does not support indexing")

    def close(self) -> None:  # noqa: B027 - optional hook
        """Release model/index resources."""
