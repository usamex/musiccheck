"""Black-box tests against a running stack (docker compose up). Real FFmpeg, real PostgreSQL,
real HTTP. No recognition provider exists yet, so identify must answer provider_unavailable.

    MUSICCHECK_CATALOG_ADMIN_TOKEN=dev-token docker compose up -d --build
    MUSICCHECK_STACK_URL=http://127.0.0.1:8000 MUSICCHECK_CATALOG_ADMIN_TOKEN=dev-token \
        uv run pytest tests/integration -v
"""

from __future__ import annotations

import os

import httpx2 as httpx
import pytest

STACK_URL = os.environ.get("MUSICCHECK_STACK_URL")
TOKEN = os.environ.get("MUSICCHECK_CATALOG_ADMIN_TOKEN")

pytestmark = [
    pytest.mark.stack,
    pytest.mark.skipif(not STACK_URL, reason="MUSICCHECK_STACK_URL not set"),
]


@pytest.fixture(scope="module")
def http():
    with httpx.Client(base_url=STACK_URL, timeout=30) as client:
        yield client


def _files(path, content_type="audio/mp4"):
    return {"audio": (path.name, path.read_bytes(), content_type)}


def test_health(http):
    r = http.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_ready_reports_database_and_ffmpeg_ok_but_no_model(http):
    r = http.get("/ready")
    body = r.json()
    assert body["checks"]["database"]["ok"] is True, body
    assert body["checks"]["ffmpeg"]["ok"] is True, body
    if body["provider"] is None:
        assert r.status_code == 503
        assert body["checks"]["recognition"]["ok"] is False


def test_phone_format_recording_is_decoded_and_reported(http, generated_audio):
    r = http.post(
        "/v1/recognition/identify",
        files=_files(generated_audio["query_m4a"]),
        data={"source": "microphone"},
    )
    body = r.json()
    assert body["query"]["codec"] == "aac"
    assert body["query"]["sample_rate"] == 44100
    assert body["query"]["channels"] == 1
    if body["provider"] is None:
        assert r.status_code == 503
        assert body["status"] == "provider_unavailable"
        assert body["error"]["code"] in {"provider_not_configured", "provider_not_ready"}


def test_silence_rejected(http, generated_audio):
    r = http.post(
        "/v1/recognition/identify", files=_files(generated_audio["silence_wav"], "audio/wav")
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "audio_silent"


@pytest.mark.skipif(not TOKEN, reason="MUSICCHECK_CATALOG_ADMIN_TOKEN not set")
def test_catalog_roundtrip_against_postgres(http, generated_audio):
    headers = {"Authorization": f"Bearer {TOKEN}"}
    data = {"title": "Integration Ref", "artist": "Test", "license": "generated-test-signal"}
    r = http.post(
        "/v1/catalog/tracks",
        files=_files(generated_audio["tagged_m4a"]),
        data=data,
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    track = r.json()
    again = http.post(
        "/v1/catalog/tracks",
        files=_files(generated_audio["tagged_m4a"]),
        data=data,
        headers=headers,
    )
    assert again.status_code == 200
    assert again.json()["id"] == track["id"]
    assert http.get(f"/v1/catalog/tracks/{track['id']}").status_code == 200
    assert http.delete(f"/v1/catalog/tracks/{track['id']}", headers=headers).status_code == 204
    assert http.get(f"/v1/catalog/tracks/{track['id']}").status_code == 404
