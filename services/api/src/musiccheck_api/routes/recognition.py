"""POST /v1/recognition/identify — see docs/API.md for the outcome table."""

from __future__ import annotations

import logging
import time
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from musiccheck_recognition import Decision
from musiccheck_recognition import audio as audio_io
from musiccheck_recognition.audio import AudioError
from sqlalchemy.orm import Session

from ..catalog import active_model_id, indexed_track_count
from ..context import AppContext, get_ctx, get_session
from ..db import Track
from ..errors import ApiError
from ..requestid import get_request_id
from ..schemas import ErrorInfo, QueryAudioInfo, RecognitionResponse, TrackSummary
from ..uploads import saved_upload

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/recognition", tags=["recognition"])

_AUDIO_ERROR_STATUS = {
    "unsupported_audio_format": 415,
    "invalid_audio": 422,
    "processing_timeout": 504,
    "internal_error": 500,
}

_RESPONSES: dict[int | str, dict] = {
    code: {"model": RecognitionResponse, "description": desc}
    for code, desc in {
        400: "invalid_input: missing or empty audio",
        413: "invalid_input: payload_too_large",
        415: "invalid_input: unsupported_audio_format",
        422: "invalid_input: invalid_audio / audio_too_short / audio_silent",
        500: "error: internal_error",
        503: "provider_unavailable",
        504: "error: processing_timeout",
    }.items()
}


@router.post("/identify", response_model=RecognitionResponse, responses=_RESPONSES)
def identify(
    request: Request,
    audio: UploadFile | None = File(None, description="Recorded audio (m4a/AAC preferred)"),
    source: Literal["microphone", "file"] = Form(
        "microphone", description="'microphone' (default) or 'file' (developer file picker)"
    ),
    ctx: AppContext = Depends(get_ctx),
    session: Session = Depends(get_session),
) -> JSONResponse:
    started = time.perf_counter()
    request_id = get_request_id(request)
    settings = ctx.settings
    provider = ctx.provider
    query: QueryAudioInfo | None = None

    def respond(status_code: int, **fields: object) -> JSONResponse:
        body = RecognitionResponse(
            request_id=request_id,
            query=query,
            processing_ms=int((time.perf_counter() - started) * 1000),
            **fields,  # type: ignore[arg-type]
        )
        log.info(
            "identify request_id=%s status=%s http=%s source=%s ms=%s",
            request_id, body.status, status_code, source, body.processing_ms,
        )  # fmt: skip
        return JSONResponse(body.model_dump(mode="json"), status_code=status_code)

    def fail(status_code: int, status: str, code: str, message: str) -> JSONResponse:
        return respond(status_code, status=status, error=ErrorInfo(code=code, message=message))

    if audio is None:
        return fail(400, "invalid_input", "missing_audio", "Form field 'audio' is required")

    sample_rate = provider.sample_rate if provider is not None else settings.validation_sample_rate
    try:
        with saved_upload(audio, settings.tmp_dir, settings.max_upload_bytes) as saved:
            probe = audio_io.probe(saved.path)
            decoded = audio_io.decode(
                saved.path,
                sample_rate=sample_rate,
                max_seconds=settings.max_query_seconds,
                timeout=settings.decode_timeout_seconds,
            )
    except ApiError as exc:
        return fail(exc.status_code, "invalid_input", exc.code, exc.message)
    except AudioError as exc:
        status_code = _AUDIO_ERROR_STATUS.get(exc.code, 422)
        status = "invalid_input" if status_code in (415, 422) else "error"
        # FFmpeg stderr (paths, addresses) stays in the logs; clients get exc.message only.
        log.log(
            logging.ERROR if status == "error" else logging.INFO,
            "identify request_id=%s audio rejected code=%s detail=%s",
            request_id, exc.code, exc.detail,
        )  # fmt: skip
        return fail(status_code, status, exc.code, exc.message)

    query = QueryAudioInfo(
        duration_seconds=round(probe.duration_seconds or decoded.duration_seconds, 3),
        analyzed_seconds=round(decoded.duration_seconds, 3),
        container=probe.container,
        codec=probe.codec,
        sample_rate=probe.sample_rate,
        channels=probe.channels,
    )

    if decoded.duration_seconds < settings.min_query_seconds:
        return fail(
            422,
            "invalid_input",
            "audio_too_short",
            f"Recording is {decoded.duration_seconds:.1f}s; at least "
            f"{settings.min_query_seconds:.1f}s is required",
        )
    level = audio_io.rms_dbfs(decoded.samples)
    if level < settings.silence_dbfs:
        return fail(
            422,
            "invalid_input",
            "audio_silent",
            f"Recording is silent ({level:.0f} dBFS RMS)",
        )

    if provider is None:
        if ctx.provider_error:  # details are in the server log and /ready
            return fail(
                503,
                "provider_unavailable",
                "provider_not_ready",
                "The recognition model failed to load",
            )
        return fail(
            503,
            "provider_unavailable",
            "provider_not_configured",
            "No recognition provider is configured on this server",
        )

    provider_fields: dict[str, object] = {
        "provider": provider.id,
        "provider_kind": provider.kind.value,
        "model_id": active_model_id(provider),
    }
    provider_status = provider.status()
    if not provider_status.ready:
        return respond(
            503,
            status="provider_unavailable",
            error=ErrorInfo(
                code="provider_not_ready",
                message=provider_status.detail or "Recognition provider is not ready",
            ),
            **provider_fields,
        )
    model_id = provider_fields["model_id"]
    if isinstance(model_id, str) and indexed_track_count(session, model_id) == 0:
        return respond(
            503,
            status="provider_unavailable",
            error=ErrorInfo(
                code="catalog_empty", message="No tracks are indexed for the active model"
            ),
            **provider_fields,
        )

    try:
        result = provider.recognize(decoded)
    except Exception:
        log.exception("identify request_id=%s provider %s failed", request_id, provider.id)
        return respond(
            500,
            status="error",
            error=ErrorInfo(code="internal_error", message="Recognition failed"),
            **provider_fields,
        )

    best = result.best
    if result.decision != Decision.MATCHED or best is None:
        return respond(
            200,
            status="no_match",
            score=best.score if best else None,
            score_kind=result.score_kind,
            confidence=None,
            **provider_fields,
        )

    track = session.get(Track, best.track_id)
    if track is None:
        # Index and metadata DB disagree — a consistency bug, never a silent no_match.
        log.error(
            "identify request_id=%s provider returned unknown track_id=%s (index/DB inconsistent)",
            request_id, best.track_id,
        )  # fmt: skip
        return respond(
            500,
            status="error",
            error=ErrorInfo(code="internal_error", message="Recognition index is inconsistent"),
            **provider_fields,
        )

    return respond(
        200,
        status="matched",
        track=TrackSummary(
            id=track.id,
            title=track.title,
            artist=track.artist,
            album=track.album,
            duration_seconds=track.duration_seconds,
            artwork_url=track.artwork_url,
        ),
        score=best.score,
        score_kind=result.score_kind,
        confidence=result.confidence,
        matched_offset_seconds=best.offset_seconds,
        **provider_fields,
    )
