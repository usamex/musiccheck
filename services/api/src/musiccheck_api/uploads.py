"""Persist an uploaded file to a temp path while enforcing size and hashing it."""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from .errors import ApiError

_CHUNK = 1024 * 1024
_SAFE_SUFFIX = re.compile(r"^\.[A-Za-z0-9]{1,8}$")


@dataclass(frozen=True)
class SavedUpload:
    path: Path
    size: int
    sha256: str
    suffix: str


def safe_suffix(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    return suffix if _SAFE_SUFFIX.match(suffix) else ""


@contextmanager
def saved_upload(upload: UploadFile, tmp_dir: Path, max_bytes: int) -> Iterator[SavedUpload]:
    """Copy ``upload`` to a temp file in ``tmp_dir``; the file is deleted on exit."""
    suffix = safe_suffix(upload.filename)
    fd, name = tempfile.mkstemp(prefix="upload-", suffix=suffix, dir=tmp_dir)
    path = Path(name)
    try:
        digest = hashlib.sha256()
        size = 0
        with os.fdopen(fd, "wb") as out:
            upload.file.seek(0)
            while chunk := upload.file.read(_CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise ApiError(
                        413, "payload_too_large", f"Audio exceeds the {max_bytes} byte limit"
                    )
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise ApiError(400, "empty_audio", "The uploaded audio file is empty")
        yield SavedUpload(path=path, size=size, sha256=digest.hexdigest(), suffix=suffix)
    finally:
        path.unlink(missing_ok=True)
