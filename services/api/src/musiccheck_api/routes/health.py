from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from musiccheck_recognition import audio as audio_io
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import __version__
from ..catalog import active_model_id, indexed_track_count
from ..context import AppContext, get_ctx, get_session
from ..schemas import HealthResponse, ProviderInfo, ReadinessCheck, ReadinessResponse

log = logging.getLogger(__name__)
router = APIRouter(tags=["operations"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    # async: never queues behind slow sync identify requests in the threadpool.
    return HealthResponse(status="ok", service="musiccheck-api", version=__version__)


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    responses={503: {"model": ReadinessResponse, "description": "Not ready"}},
)
def ready(
    ctx: AppContext = Depends(get_ctx), session: Session = Depends(get_session)
) -> JSONResponse:
    checks: dict[str, ReadinessCheck] = {}

    try:
        session.execute(text("SELECT 1"))
        checks["database"] = ReadinessCheck(ok=True)
    except Exception as exc:
        log.warning("Readiness: database check failed: %s", exc)
        checks["database"] = ReadinessCheck(ok=False, detail=f"unreachable ({type(exc).__name__})")

    version = audio_io.ffmpeg_version()
    checks["ffmpeg"] = ReadinessCheck(ok=version is not None, detail=version or "ffmpeg not found")

    provider = ctx.provider
    provider_info: ProviderInfo | None = None
    if provider is None:
        detail = ctx.provider_error or (
            "No recognition provider configured "
            f"(MUSICCHECK_RECOGNITION_PROVIDER={ctx.settings.recognition_provider})"
        )
        checks["recognition"] = ReadinessCheck(ok=False, detail=detail)
        checks["catalog"] = ReadinessCheck(ok=False, detail="No active model")
    else:
        status = provider.status()
        model_id = active_model_id(provider)
        provider_info = ProviderInfo(
            id=provider.id,
            kind=provider.kind.value,
            model_id=model_id,
            ready=status.ready,
            detail=status.detail,
        )
        checks["recognition"] = ReadinessCheck(ok=status.ready, detail=status.detail)
        if model_id is not None:
            if checks["database"].ok:
                count = indexed_track_count(session, model_id)
                checks["catalog"] = ReadinessCheck(
                    ok=count > 0, detail=f"{count} tracks indexed for active model"
                )
            else:
                checks["catalog"] = ReadinessCheck(ok=False, detail="database unavailable")

    body = ReadinessResponse(
        ready=all(c.ok for c in checks.values()), checks=checks, provider=provider_info
    )
    return JSONResponse(body.model_dump(mode="json"), status_code=200 if body.ready else 503)
