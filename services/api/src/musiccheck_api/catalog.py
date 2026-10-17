"""Catalog ingestion, indexing and removal (docs/API.md#catalog, ADR-0004).

Kept free of HTTP concerns so a future re-index CLI (backlog BE-7) can reuse it.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from musiccheck_recognition import RecognitionProvider
from musiccheck_recognition import audio as audio_io
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import Settings
from .db import IndexStatus, Track, TrackIndexEntry, utcnow
from .errors import ApiError
from .schemas import TrackIndexing, TrackOut
from .uploads import SavedUpload

log = logging.getLogger(__name__)

# Container name (first token of ffprobe's format_name) → file extension for stored references.
_EXTENSIONS = {
    "mov": ".m4a",
    "wav": ".wav",
    "mp3": ".mp3",
    "ogg": ".ogg",
    "matroska": ".webm",
    "flac": ".flac",
    "aac": ".aac",
    "amr": ".amr",
    "caf": ".caf",
    "aiff": ".aiff",
}


@dataclass(frozen=True)
class ReferenceMetadata:
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    recording_id: str | None = None
    source: str | None = None
    license: str | None = None
    artwork_url: str | None = None


def active_model_id(provider: RecognitionProvider | None) -> str | None:
    info = provider.model_info() if provider is not None else None
    return info.model_id if info is not None else None


def indexed_track_count(session: Session, model_id: str) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(TrackIndexEntry)
            .where(
                TrackIndexEntry.model_id == model_id, TrackIndexEntry.status == IndexStatus.INDEXED
            )
        )
        or 0
    )


def track_out(track: Track, model_id: str | None) -> TrackOut:
    entry = next((e for e in track.index_entries if e.model_id == model_id), None)
    if entry is None:
        indexing = TrackIndexing(
            status="pending", model_id=model_id, segment_count=None, error=None, updated_at=None
        )
    else:
        indexing = TrackIndexing(
            status=entry.status,  # type: ignore[arg-type]
            model_id=entry.model_id,
            segment_count=entry.segment_count,
            error=entry.error,
            updated_at=entry.updated_at,
        )
    return TrackOut(
        id=track.id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        duration_seconds=track.duration_seconds,
        artwork_url=track.artwork_url,
        recording_id=track.recording_id,
        source=track.source,
        license=track.license,
        audio_sha256=track.audio_sha256,
        created_at=track.created_at,
        indexing=indexing,
    )


def find_by_sha256(session: Session, sha256: str) -> Track | None:
    return session.scalar(select(Track).where(Track.audio_sha256 == sha256))


def ingest_reference(
    session: Session,
    settings: Settings,
    provider: RecognitionProvider | None,
    upload: SavedUpload,
    meta: ReferenceMetadata,
) -> tuple[Track, bool]:
    """Store a reference recording. Returns (track, created). Idempotent on audio SHA-256."""
    existing = find_by_sha256(session, upload.sha256)
    if existing is not None:
        return existing, False
    session.rollback()  # don't hold a transaction open across FFmpeg work

    probe = audio_io.probe(upload.path)
    if (
        probe.duration_seconds is not None
        and probe.duration_seconds > settings.max_reference_seconds
    ):
        raise ApiError(
            422,
            "audio_too_long",
            f"Reference audio is {probe.duration_seconds:.0f}s; limit is "
            f"{settings.max_reference_seconds:.0f}s",
        )
    # Full decode at the validation rate proves the file is intact and measures the real duration
    # (containers can omit or misreport it). One extra second detects over-long audio.
    decoded = audio_io.decode(
        upload.path,
        sample_rate=settings.validation_sample_rate,
        max_seconds=settings.max_reference_seconds + 1.0,
        timeout=settings.reference_decode_timeout_seconds,
    )
    if decoded.duration_seconds > settings.max_reference_seconds:
        raise ApiError(
            422,
            "audio_too_long",
            f"Reference audio exceeds the {settings.max_reference_seconds:.0f}s limit",
        )
    if decoded.duration_seconds < settings.min_query_seconds:
        raise ApiError(422, "audio_too_short", "Reference audio is too short")
    if audio_io.rms_dbfs(decoded.samples) < settings.silence_dbfs:
        raise ApiError(422, "audio_silent", "Reference audio is silent")

    title = meta.title or probe.tags.get("title")
    artist = meta.artist or probe.tags.get("artist") or probe.tags.get("album_artist")
    if not title or not artist:
        raise ApiError(
            422,
            "missing_metadata",
            "title and artist are required (no embedded tags were found to fall back on)",
        )

    container = probe.container.split(",")[0]
    suffix = _EXTENSIONS.get(container) or upload.suffix or ".bin"
    final_path = settings.catalog_audio_dir / f"{upload.sha256}{suffix}"
    created_file = _store_atomically(upload, final_path)
    album = meta.album or probe.tags.get("album") or None

    track = Track(
        title=title[:500],
        artist=artist[:500],
        album=album[:500] if album else None,
        duration_seconds=round(decoded.duration_seconds, 3),
        artwork_url=meta.artwork_url,
        recording_id=meta.recording_id,
        source=meta.source,
        license=meta.license,
        audio_sha256=upload.sha256,
        # Relative to data_dir so the catalog survives a moved volume / different CWD.
        audio_path=str(final_path.relative_to(settings.data_dir)),
    )
    session.add(track)
    try:
        session.commit()
    except IntegrityError:
        # Concurrent ingest of the same audio: the other request won; return its row (it
        # references the same, complete file).
        session.rollback()
        existing = find_by_sha256(session, upload.sha256)
        if existing is None:
            raise
        return existing, False
    except Exception:
        session.rollback()
        if created_file and find_by_sha256(session, upload.sha256) is None:
            final_path.unlink(missing_ok=True)
        raise
    return track, True


def _store_atomically(upload: SavedUpload, final_path: Path) -> bool:
    """Copy the upload to ``final_path`` via temp file + rename. Returns True if written now.

    An existing file of the right size is reused (its name is the content hash); anything else
    is replaced, so a crash mid-copy can never leave a permanently truncated reference.
    """
    if final_path.exists() and final_path.stat().st_size == upload.size:
        return False
    fd, tmp_name = tempfile.mkstemp(prefix=".partial-", dir=final_path.parent)
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        shutil.copyfile(upload.path, tmp_path)
        os.replace(tmp_path, final_path)
    finally:
        tmp_path.unlink(missing_ok=True)
    return True


def index_track(
    session: Session,
    settings: Settings,
    provider: RecognitionProvider,
    track: Track,
    *,
    force: bool = False,
) -> TrackIndexEntry:
    """Index ``track`` with the active model. Safe to re-run; failures are recorded, not raised."""
    info = provider.model_info()
    if info is None or not provider.supports_indexing:
        raise ValueError(f"Provider {provider.id!r} does not support indexing")
    entry = session.scalar(
        select(TrackIndexEntry).where(
            TrackIndexEntry.track_id == track.id, TrackIndexEntry.model_id == info.model_id
        )
    )
    if entry is not None and entry.status == IndexStatus.INDEXED and not force:
        return entry
    if entry is None:
        entry = TrackIndexEntry(track_id=track.id, model_id=info.model_id)
        session.add(entry)
    entry.status = IndexStatus.INDEXING
    entry.error = None
    session.commit()

    try:
        decoded = audio_io.decode(
            settings.data_path(track.audio_path),
            sample_rate=provider.sample_rate,
            max_seconds=settings.max_reference_seconds,
            timeout=settings.reference_decode_timeout_seconds,
        )
        report = provider.index_track(track.id, decoded)
    except Exception as exc:  # record every failure (decode or model) for the re-index job
        log.exception("Indexing failed track_id=%s model_id=%s", track.id, info.model_id)
        entry.status = IndexStatus.FAILED
        entry.error = str(exc)[:2000]
        entry.updated_at = utcnow()
        session.commit()
        return entry

    entry.status = IndexStatus.INDEXED
    entry.segment_count = report.segment_count
    entry.updated_at = utcnow()
    session.commit()
    return entry


def delete_track(
    session: Session, settings: Settings, provider: RecognitionProvider | None, track: Track
) -> None:
    """Remove a track from the active provider's index, the DB and disk.

    Callers must refuse (503) when a provider is configured but unavailable; otherwise its
    index would keep vectors for a deleted track (reconciliation: backlog BE-8).
    """
    if provider is not None and provider.supports_indexing:
        provider.remove_track(track.id)
    audio_path = settings.data_path(track.audio_path)
    sha = track.audio_sha256
    session.delete(track)
    session.commit()
    # Only remove the file if no other row references it (sha256 is unique, so none should).
    if find_by_sha256(session, sha) is None:
        audio_path.unlink(missing_ok=True)
