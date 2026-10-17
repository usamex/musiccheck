"""Pydantic models for the public HTTP contract (docs/API.md, packages/shared/openapi.json)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

RecognitionStatus = Literal["matched", "no_match", "invalid_input", "provider_unavailable", "error"]
ProviderKindLiteral = Literal["self_hosted_model", "external_service"]
IndexStatusLiteral = Literal["pending", "indexing", "indexed", "failed"]


class ErrorInfo(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    request_id: str
    error: ErrorInfo


class TrackSummary(BaseModel):
    id: str
    title: str
    artist: str
    album: str | None
    duration_seconds: float | None
    artwork_url: str | None


class QueryAudioInfo(BaseModel):
    duration_seconds: float = Field(
        description="Duration of the uploaded audio (container-reported, else decoded)."
    )
    analyzed_seconds: float = Field(description="Seconds actually analysed (after truncation).")
    container: str
    codec: str | None
    sample_rate: int | None = Field(
        description="Sample rate of the uploaded stream, not the analysis rate."
    )
    channels: int | None


class RecognitionResponse(BaseModel):
    request_id: str
    status: RecognitionStatus
    provider: str | None = None
    provider_kind: ProviderKindLiteral | None = None
    model_id: str | None = None
    track: TrackSummary | None = None
    score: float | None = Field(
        default=None,
        description="Provider-specific match strength (see score_kind). NOT a probability.",
    )
    score_kind: str | None = None
    confidence: float | None = Field(
        default=None,
        description="Calibrated probability of correctness. Null until calibrated (backlog ML-6).",
    )
    matched_offset_seconds: float | None = None
    query: QueryAudioInfo | None = None
    error: ErrorInfo | None = None
    processing_ms: int


class TrackIndexing(BaseModel):
    status: IndexStatusLiteral
    model_id: str | None
    segment_count: int | None
    error: str | None
    updated_at: datetime | None


class TrackOut(BaseModel):
    id: str
    title: str
    artist: str
    album: str | None
    duration_seconds: float | None
    artwork_url: str | None
    recording_id: str | None
    source: str | None
    license: str | None
    audio_sha256: str
    created_at: datetime
    indexing: TrackIndexing


class TrackList(BaseModel):
    items: list[TrackOut]
    total: int
    limit: int
    offset: int


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


class ReadinessCheck(BaseModel):
    ok: bool
    detail: str | None = None


class ProviderInfo(BaseModel):
    id: str
    kind: ProviderKindLiteral
    model_id: str | None
    ready: bool
    detail: str | None


class ReadinessResponse(BaseModel):
    ready: bool
    checks: dict[str, ReadinessCheck]
    provider: ProviderInfo | None
