"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers
from starlette.types import Scope

from . import __version__
from .config import MIB, Settings
from .context import AppContext, admin_token_matches
from .errors import install_error_handlers
from .requestid import BodySizeLimitMiddleware, RequestIdMiddleware
from .routes import catalog, health, recognition

# Slack for the multipart envelope and small form fields around the audio part.
_MULTIPART_SLACK = 64 * 1024


def _body_limit(settings: Settings):
    def limit_for(scope: Scope) -> int:
        path: str = scope.get("path", "")
        if path.startswith("/v1/recognition/"):
            return settings.max_upload_bytes + _MULTIPART_SLACK
        if path.startswith("/v1/catalog/") and scope.get("method") == "POST":
            # Large reference uploads only for authenticated admins; everyone else is cut off
            # early instead of spooling hundreds of MB before the 401.
            auth = Headers(scope=scope).get("authorization")
            if admin_token_matches(settings, auth):
                return settings.max_reference_upload_bytes + _MULTIPART_SLACK
        return 1 * MIB

    return limit_for


def create_app(settings: Settings | None = None, ctx: AppContext | None = None) -> FastAPI:
    """Build the app. Tests pass ``ctx`` to inject a database or a test provider."""
    settings = ctx.settings if ctx is not None else (settings or Settings())
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        context = ctx if ctx is not None else AppContext.from_settings(settings)
        app.state.ctx = context
        try:
            yield
        finally:
            if ctx is None:
                context.close()

    app = FastAPI(
        title="MusicCheck API",
        version=__version__,
        description="Music recognition API. Contract: docs/API.md.",
        lifespan=lifespan,
    )
    install_error_handlers(app)
    if settings.cors_allow_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_allow_origins,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["authorization", "content-type", "x-request-id"],
        )
    app.add_middleware(BodySizeLimitMiddleware, limit_for=_body_limit(settings))
    app.add_middleware(RequestIdMiddleware)  # outermost: every response carries X-Request-ID

    app.include_router(health.router)
    app.include_router(recognition.router)
    app.include_router(catalog.router)
    return app
