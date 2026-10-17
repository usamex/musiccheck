from __future__ import annotations

from stub_provider import StubProvider

from conftest import auth, upload


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "musiccheck-api", "version": "0.1.0"}
    assert r.headers["x-request-id"].startswith("req_")


def test_request_id_is_echoed_when_valid(client):
    assert (
        client.get("/health", headers={"X-Request-ID": "abc-123"}).headers["x-request-id"]
        == "abc-123"
    )
    bad = client.get("/health", headers={"X-Request-ID": "no spaces allowed!"})
    assert bad.headers["x-request-id"].startswith("req_")


def test_ready_without_provider_is_honest(client):
    r = client.get("/ready")
    assert r.status_code == 503
    body = r.json()
    assert body["ready"] is False
    assert body["provider"] is None
    assert body["checks"]["database"]["ok"] is True
    assert body["checks"]["ffmpeg"]["ok"] is True
    assert body["checks"]["recognition"]["ok"] is False
    assert "MUSICCHECK_RECOGNITION_PROVIDER=none" in body["checks"]["recognition"]["detail"]


def test_ready_reports_provider_load_failure(make_client):
    client = make_client(provider_error="Provider 'neural' failed to load: checkpoint missing")
    body = client.get("/ready").json()
    assert "checkpoint missing" in body["checks"]["recognition"]["detail"]


def test_ready_with_provider_requires_indexed_catalog(make_client, generated_audio):
    provider = StubProvider()
    client = make_client(provider=provider)
    body = client.get("/ready").json()
    assert body["checks"]["recognition"]["ok"] is True
    assert body["checks"]["catalog"] == {"ok": False, "detail": "0 tracks indexed for active model"}
    assert body["provider"]["id"] == "stub"
    assert body["provider"]["kind"] == "self_hosted_model"

    r = client.post(
        "/v1/catalog/tracks",
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    )
    assert r.status_code == 201
    r = client.get("/ready")
    assert r.status_code == 200
    assert r.json()["ready"] is True


def test_unknown_route_uses_error_envelope(client):
    r = client.get("/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_stale_uploads_swept_at_startup(make_client, tmp_path):
    import os
    import time

    tmp_dir = tmp_path / "data" / "tmp"
    tmp_dir.mkdir(parents=True)
    old, fresh = tmp_dir / "upload-old.m4a", tmp_dir / "upload-fresh.m4a"
    old.write_bytes(b"x")
    fresh.write_bytes(b"x")
    os.utime(old, (time.time() - 3600, time.time() - 3600))
    make_client()
    assert not old.exists()
    assert fresh.exists()
