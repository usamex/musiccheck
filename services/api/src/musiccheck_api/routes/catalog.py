"""Catalog endpoints: ingest, read, list, delete reference recordings."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from fastapi.responses import JSONResponse
from musiccheck_recognition.audio import AudioError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import catalog
from ..context import AppContext, get_ctx, get_session, require_admin
from ..db import Track
from ..errors import ApiError
from ..schemas import ErrorResponse, TrackList, TrackOut
from ..uploads import saved_upload

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/catalog", tags=["catalog"])

_ERRORS: dict[int | str, dict] = {
    code: {"model": ErrorResponse} for code in (400, 401, 404, 413, 415, 422, 503)
}


def _clean(value: str | None) -> str | None:
    value = value.strip() if value else None
    return value or None


@router.post(
    "/tracks",
    response_model=TrackOut,
    status_code=201,
    responses={200: {"model": TrackOut, "description": "Already ingested (same audio)"}, **_ERRORS},
    dependencies=[Depends(require_admin)],
)
def create_track(
    audio: UploadFile | None = File(None),
    title: str | None = Form(None, max_length=500),
    artist: str | None = Form(None, max_length=500),
    album: str | None = Form(None, max_length=500),
    recording_id: str | None = Form(None, max_length=200),
    source: str | None = Form(None, max_length=200),
    license: str | None = Form(None, max_length=200),
    artwork_url: str | None = Form(None, max_length=2000),
    ctx: AppContext = Depends(get_ctx),
    session: Session = Depends(get_session),
) -> JSONResponse:
    if audio is None:
        raise ApiError(400, "missing_audio", "Form field 'audio' is required")
    meta = catalog.ReferenceMetadata(
        title=_clean(title),
        artist=_clean(artist),
        album=_clean(album),
        recording_id=_clean(recording_id),
        source=_clean(source),
        license=_clean(license),
        artwork_url=_clean(artwork_url),
    )
    settings = ctx.settings
    try:
        with saved_upload(audio, settings.tmp_dir, settings.max_reference_upload_bytes) as saved:
            track, created = catalog.ingest_reference(session, settings, ctx.provider, saved, meta)
    except AudioError as exc:
        status = {
            "unsupported_audio_format": 415,
            "processing_timeout": 504,
            "internal_error": 500,
        }.get(exc.code, 422)
        if exc.detail:
            log.warning("Reference audio rejected code=%s detail=%s", exc.code, exc.detail)
        raise ApiError(status, exc.code, exc.message) from exc

    provider = ctx.provider
    if created and provider is not None and provider.supports_indexing and provider.status().ready:
        catalog.index_track(session, settings, provider, track)
        session.refresh(track)

    body = catalog.track_out(track, catalog.active_model_id(provider))
    return JSONResponse(body.model_dump(mode="json"), status_code=201 if created else 200)


@router.get("/tracks", response_model=TrackList)
def list_tracks(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    ctx: AppContext = Depends(get_ctx),
    session: Session = Depends(get_session),
) -> TrackList:
    total = session.scalar(select(func.count()).select_from(Track)) or 0
    rows = session.scalars(
        select(Track)
        .options(selectinload(Track.index_entries))
        .order_by(Track.created_at, Track.id)
        .limit(limit)
        .offset(offset)
    ).all()
    model_id = catalog.active_model_id(ctx.provider)
    return TrackList(
        items=[catalog.track_out(t, model_id) for t in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/tracks/{track_id}", response_model=TrackOut, responses={404: {"model": ErrorResponse}}
)
def get_track(
    track_id: str, ctx: AppContext = Depends(get_ctx), session: Session = Depends(get_session)
) -> TrackOut:
    track = session.get(Track, track_id)
    if track is None:
        raise ApiError(404, "track_not_found", f"No track with id {track_id!r}")
    return catalog.track_out(track, catalog.active_model_id(ctx.provider))


@router.delete(
    "/tracks/{track_id}",
    status_code=204,
    responses={k: v for k, v in _ERRORS.items() if k in (401, 404, 503)},
    dependencies=[Depends(require_admin)],
)
def delete_track(
    track_id: str, ctx: AppContext = Depends(get_ctx), session: Session = Depends(get_session)
) -> Response:
    track = session.get(Track, track_id)
    if track is None:
        raise ApiError(404, "track_not_found", f"No track with id {track_id!r}")
    provider = ctx.provider
    configured = ctx.settings.recognition_provider.strip().lower() != "none"
    if configured and (provider is None or not provider.status().ready):
        raise ApiError(
            503,
            "provider_unavailable",
            "The recognition provider is unavailable, so the track cannot be removed from its "
            "index; retry when /ready is green",
        )
    catalog.delete_track(session, ctx.settings, provider, track)
    return Response(status_code=204)
