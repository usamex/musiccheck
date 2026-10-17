"""Request-ID, last-resort error and request-body-size middleware.

Pure ASGI so that (a) body limits apply while the body streams in and (b) even unhandled
exceptions get an ``X-Request-ID`` header and the route-appropriate error shape. (Starlette runs
app-level ``Exception`` handlers outside all user middleware, so they cannot do this.)
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import Callable

from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .envelopes import error_envelope

log = logging.getLogger(__name__)

_VALID_ID = re.compile(r"[A-Za-z0-9_.-]{1,64}")
_STATE_KEY = "request_id"
TOO_LARGE_MESSAGE = "Request body exceeds the upload size limit"


def get_request_id(request: Request) -> str:
    return request.scope.get("state", {}).get(_STATE_KEY) or "req_unknown"


def _incoming_id(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"x-request-id":
            candidate = value.decode("latin-1")
            return candidate if _VALID_ID.fullmatch(candidate) else None
    return None


async def send_json(send: Send, status: int, body: dict, *, close: bool = False) -> None:
    payload = json.dumps(body).encode()
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(payload)).encode()),
    ]
    if close:
        headers.append((b"connection", b"close"))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": payload})


class RequestIdMiddleware:
    """Outermost middleware: assigns the request id, stamps it on every response, and turns
    unhandled exceptions into a logged 500 with the proper envelope."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = _incoming_id(scope) or f"req_{uuid.uuid4().hex[:16]}"
        scope.setdefault("state", {})[_STATE_KEY] = request_id
        response_started = False

        async def send_with_id(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            log.exception("Unhandled error request_id=%s path=%s", request_id, scope.get("path"))
            if response_started:
                raise
            body = error_envelope(
                scope.get("path", ""), request_id, 500, "internal_error", "Internal server error"
            )
            await send_json(send_with_id, 500, body)


class BodySizeLimitMiddleware:
    """Reject request bodies above a per-request limit with 413, without buffering them.

    Starlette's multipart parser spools the whole body before the endpoint runs, so the limit
    must be enforced here. ``limit_for`` picks the limit per request (path, auth), so callers
    can grant large limits only to authenticated catalog uploads. Include slack for the
    multipart envelope.
    """

    def __init__(self, app: ASGIApp, limit_for: Callable[[Scope], int]):
        self.app = app
        self.limit_for = limit_for

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = self.limit_for(scope)

        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    declared = 0
                if declared > limit:
                    await self._reject(scope, send)
                    return

        received = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # An HTTPException passes through FastAPI's body parsing unchanged and is
                    # rendered by the 413 handler in errors.py.
                    raise BodyTooLarge()
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except BodyTooLarge:
            if not response_started:
                await self._reject(scope, send)

    @staticmethod
    async def _reject(scope: Scope, send: Send) -> None:
        # ``send`` is RequestIdMiddleware's wrapper, which adds X-Request-ID.
        request_id = scope.get("state", {}).get(_STATE_KEY, "req_unknown")
        body = error_envelope(
            scope.get("path", ""), request_id, 413, "payload_too_large", TOO_LARGE_MESSAGE
        )
        await send_json(send, 413, body, close=True)


class BodyTooLarge(StarletteHTTPException):
    def __init__(self) -> None:
        super().__init__(status_code=413, detail=TOO_LARGE_MESSAGE)
