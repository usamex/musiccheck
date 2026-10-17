"""Application context (settings, DB, provider) and FastAPI dependencies."""

from __future__ import annotations

import hmac
import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass

from fastapi import Depends, Request
from musiccheck_recognition import RecognitionProvider
from musiccheck_recognition.registry import UnknownProviderError, create_provider
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .config import Settings
from .db import make_engine, make_session_factory
from .errors import ApiError

log = logging.getLogger(__name__)


@dataclass
class AppContext:
    settings: Settings
    engine: Engine
    session_factory: sessionmaker[Session]
    provider: RecognitionProvider | None = None
    #: Why the configured provider could not be created (e.g. checkpoint missing).
    provider_error: str | None = None

    @classmethod
    def from_settings(
        cls, settings: Settings, provider: RecognitionProvider | None = None
    ) -> AppContext:
        settings.ensure_dirs()
        sweep_stale_uploads(settings)
        engine = make_engine(settings.database_url)
        ctx = cls(settings=settings, engine=engine, session_factory=make_session_factory(engine))
        if provider is not None:
            ctx.provider = provider
        else:
            ctx.load_provider()
        return ctx

    def load_provider(self) -> None:
        name = self.settings.recognition_provider
        try:
            # UnknownProviderError (a config typo) propagates and stops startup on purpose.
            self.provider = create_provider(name)
        except UnknownProviderError:
            raise
        except Exception as exc:  # model/checkpoint load failure: stay up, report not ready
            log.exception("Recognition provider %r failed to load", name)
            self.provider = None
            self.provider_error = f"Provider {name!r} failed to load ({type(exc).__name__})"

    def close(self) -> None:
        if self.provider is not None:
            self.provider.close()
        self.engine.dispose()


def sweep_stale_uploads(settings: Settings, max_age_seconds: float = 15 * 60) -> None:
    """Delete temp uploads left behind by a crashed process (query audio is never kept).

    Only old files are removed so another worker's in-flight upload is not touched.
    """
    cutoff = time.time() - max_age_seconds
    for path in settings.tmp_dir.glob("upload-*"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            log.warning("Could not remove stale upload %s", path)


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx


def get_session(ctx: AppContext = Depends(get_ctx)) -> Iterator[Session]:
    session = ctx.session_factory()
    try:
        yield session
    finally:
        session.close()


def admin_token_matches(settings: Settings, authorization: str | None) -> bool:
    token = settings.catalog_admin_token
    if token is None or not authorization:
        return False
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return False
    return hmac.compare_digest(value.strip().encode(), token.get_secret_value().encode())


def require_admin(request: Request, ctx: AppContext = Depends(get_ctx)) -> None:
    if ctx.settings.catalog_admin_token is None:
        raise ApiError(
            503,
            "catalog_admin_disabled",
            "Catalog writes are disabled: MUSICCHECK_CATALOG_ADMIN_TOKEN is not set",
        )
    if not admin_token_matches(ctx.settings, request.headers.get("authorization")):
        raise ApiError(401, "unauthorized", "A valid catalog admin bearer token is required")
