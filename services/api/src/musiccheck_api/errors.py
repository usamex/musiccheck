"""Exception → error-envelope handlers (shape chosen per route by envelopes.py).

Unhandled exceptions are handled by RequestIdMiddleware, not here, so they still carry
X-Request-ID.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .envelopes import error_envelope
from .requestid import BodyTooLarge, get_request_id


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _respond(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = error_envelope(request.url.path, get_request_id(request), status_code, code, message)
    return JSONResponse(body, status_code=status_code, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        return _respond(request, exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
        message = f"{loc}: {first.get('msg', 'invalid request')}" if loc else "Invalid request"
        return _respond(request, 422, "invalid_request", message)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc, BodyTooLarge):
            return _respond(
                request, 413, "payload_too_large", str(exc.detail), {"connection": "close"}
            )
        code = {
            400: "invalid_request",
            404: "not_found",
            405: "method_not_allowed",
            413: "payload_too_large",
        }.get(exc.status_code, "http_error")
        return _respond(
            request, exc.status_code, code, str(exc.detail), getattr(exc, "headers", None)
        )
