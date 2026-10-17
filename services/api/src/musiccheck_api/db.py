"""SQLAlchemy ORM models and session handling.

Schema changes go through Alembic (services/api/alembic). Models stay portable between
PostgreSQL (dev/prod) and SQLite (fast unit tests).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)
from sqlalchemy.types import TypeDecorator


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware UTC datetimes on every backend (SQLite drops tzinfo on read)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("naive datetime; use timezone-aware UTC")
        return value.astimezone(UTC) if value is not None else None

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def new_track_id() -> str:
    return f"trk_{uuid.uuid4().hex}"


class IndexStatus(StrEnum):
    PENDING = "pending"
    INDEXING = "indexing"
    INDEXED = "indexed"
    FAILED = "failed"


class Base(DeclarativeBase):
    pass


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=new_track_id)
    title: Mapped[str] = mapped_column(String(500))
    artist: Mapped[str] = mapped_column(String(500))
    album: Mapped[str | None] = mapped_column(String(500))
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    artwork_url: Mapped[str | None] = mapped_column(String(2000))
    recording_id: Mapped[str | None] = mapped_column(String(200), index=True)
    source: Mapped[str | None] = mapped_column(String(200))
    license: Mapped[str | None] = mapped_column(String(200))
    audio_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    audio_path: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    index_entries: Mapped[list[TrackIndexEntry]] = relationship(
        back_populates="track", cascade="all, delete-orphan", passive_deletes=True
    )


class TrackIndexEntry(Base):
    """Indexing state of one track for one model version (ADR-0004).

    Entries for inactive model versions are retained so a catalog can be re-indexed or rolled
    back, but only entries whose ``model_id`` equals the active provider's model_id count.
    """

    __tablename__ = "track_index_entries"
    __table_args__ = (UniqueConstraint("track_id", "model_id", name="uq_track_model"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    track_id: Mapped[str] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    model_id: Mapped[str] = mapped_column(String(200), index=True)
    status: Mapped[str] = mapped_column(String(20), default=IndexStatus.PENDING)
    segment_count: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    track: Mapped[Track] = relationship(back_populates="index_entries")


def make_engine(database_url: str) -> Engine:
    if database_url.startswith("sqlite"):
        engine = create_engine(
            database_url, connect_args={"check_same_thread": False}, pool_pre_ping=True
        )

        @event.listens_for(engine, "connect")
        def _sqlite_fk(dbapi_connection, _record):  # pragma: no cover - trivial
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    # Bounded connect so /ready cannot hang on an unreachable database.
    return create_engine(database_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
