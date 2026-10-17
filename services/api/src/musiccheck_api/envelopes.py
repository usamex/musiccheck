"""Error bodies. Recognition routes always answer with the RecognitionResponse shape
(ADR-0002); every other route uses ``{"request_id", "error": {"code", "message"}}``."""

from __future__ import annotations

from .schemas import ErrorInfo, RecognitionResponse

RECOGNITION_PREFIX = "/v1/recognition/"


def is_recognition_path(path: str) -> bool:
    return path.startswith(RECOGNITION_PREFIX)


def error_envelope(path: str, request_id: str, status_code: int, code: str, message: str) -> dict:
    if is_recognition_path(path):
        status = "invalid_input" if 400 <= status_code < 500 else "error"
        return RecognitionResponse(
            request_id=request_id,
            status=status,
            error=ErrorInfo(code=code, message=message),
            processing_ms=0,
        ).model_dump(mode="json")
    return {"request_id": request_id, "error": {"code": code, "message": message}}
