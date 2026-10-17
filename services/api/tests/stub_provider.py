"""TEST DOUBLE — not a recognition engine.

Used only to exercise API serialization, catalog bookkeeping and error paths without a model.
It performs no audio analysis: ``recognize`` returns whatever the test configured. Passing
tests that use it say nothing about recognition quality (docs/agent/FINDINGS.md F-007).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from musiccheck_recognition import (
    Candidate,
    Decision,
    DecodedAudio,
    IndexReport,
    ModelInfo,
    ProviderKind,
    ProviderStatus,
    Recognition,
    RecognitionProvider,
)


@dataclass
class StubProvider(RecognitionProvider):
    ready: bool = True
    #: Track id to return as a match, or None to return no_match.
    match_track_id: str | None = None
    fail_recognize: bool = False
    fail_index: bool = False
    indexed: dict[str, int] = field(default_factory=dict)
    removed: list[str] = field(default_factory=list)
    id: str = "stub"
    kind: ProviderKind = ProviderKind.SELF_HOSTED_MODEL

    def status(self) -> ProviderStatus:
        return ProviderStatus(ready=self.ready, detail=None if self.ready else "stub not ready")

    def model_info(self) -> ModelInfo:
        return ModelInfo(
            name="stub", version="0", checkpoint_sha256=None, sample_rate=8000, embedding_dim=None
        )

    @property
    def supports_indexing(self) -> bool:
        return True

    def recognize(self, audio: DecodedAudio) -> Recognition:
        if self.fail_recognize:
            raise RuntimeError("stub failure")
        if self.match_track_id is None:
            return Recognition(Decision.NO_MATCH, (), score_kind="stub")
        return Recognition(
            Decision.MATCHED,
            (Candidate(self.match_track_id, score=0.5, offset_seconds=3.0),),
            score_kind="stub",
        )

    def index_track(self, track_id: str, audio: DecodedAudio) -> IndexReport:
        if self.fail_index:
            raise RuntimeError("stub index failure")
        segments = max(1, int(audio.duration_seconds))
        self.indexed[track_id] = segments
        return IndexReport(
            track_id=track_id, model_id=self.model_info().model_id, segment_count=segments
        )

    def remove_track(self, track_id: str) -> None:
        self.removed.append(track_id)
        self.indexed.pop(track_id, None)
