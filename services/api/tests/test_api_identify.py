"""Identify endpoint: validation paths use real FFmpeg on generated audio. Paths that need a
provider use StubProvider (a labelled test double) — they test plumbing, not recognition."""

from __future__ import annotations

import pytest
from stub_provider import StubProvider

from conftest import auth, upload

URL = "/v1/recognition/identify"
RESPONSE_KEYS = {
    "request_id", "status", "provider", "provider_kind", "model_id", "track", "score",
    "score_kind", "confidence", "matched_offset_seconds", "query", "error", "processing_ms",
}  # fmt: skip


def _check_shape(body: dict) -> None:
    assert set(body) == RESPONSE_KEYS
    assert body["request_id"].startswith("req_")


def test_missing_audio(client):
    r = client.post(URL, data={"source": "microphone"})
    assert r.status_code == 400
    body = r.json()
    _check_shape(body)
    assert body["status"] == "invalid_input"
    assert body["error"]["code"] == "missing_audio"


def test_empty_audio(client, generated_audio):
    r = client.post(URL, files=upload(generated_audio["empty"]))
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "empty_audio"


def test_valid_phone_recording_without_provider_is_503_with_query_info(client, generated_audio):
    r = client.post(URL, files=upload(generated_audio["query_m4a"]), data={"source": "microphone"})
    assert r.status_code == 503
    body = r.json()
    _check_shape(body)
    assert body["status"] == "provider_unavailable"
    assert body["error"]["code"] == "provider_not_configured"
    assert body["track"] is None and body["score"] is None and body["confidence"] is None
    q = body["query"]
    assert q["codec"] == "aac" and q["sample_rate"] == 44100 and q["channels"] == 1
    assert q["duration_seconds"] == pytest.approx(6.0, abs=0.1)


def test_provider_load_failure_is_provider_not_ready(make_client, generated_audio):
    client = make_client(provider_error="Provider 'neural' failed to load: boom")
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "provider_not_ready"


def test_long_recording_is_truncated_not_rejected(client, generated_audio):
    r = client.post(URL, files=upload(generated_audio["long_wav"], "audio/wav"))
    assert r.status_code == 503
    q = r.json()["query"]
    assert q["duration_seconds"] == pytest.approx(45.0, abs=0.1)
    assert q["analyzed_seconds"] == pytest.approx(30.0, abs=0.01)


@pytest.mark.parametrize(
    ("name", "status_code", "code"),
    [
        ("silence_wav", 422, "audio_silent"),
        ("short_m4a", 422, "audio_too_short"),
        ("not_audio", 415, "unsupported_audio_format"),
        ("video_only_mp4", 415, "unsupported_audio_format"),
        ("truncated_m4a", 422, "invalid_audio"),
    ],
)
def test_invalid_inputs(client, generated_audio, name, status_code, code):
    r = client.post(URL, files=upload(generated_audio[name]))
    assert r.status_code == status_code, r.text
    body = r.json()
    _check_shape(body)
    assert body["status"] == "invalid_input"
    assert body["error"]["code"] == code


def test_oversized_upload_rejected_by_content_length(make_client, generated_audio):
    client = make_client(max_upload_bytes=20_000)
    r = client.post(URL, files=upload(generated_audio["query_wav"], "audio/wav"))
    assert r.status_code == 413
    body = r.json()
    _check_shape(body)
    assert body["status"] == "invalid_input"
    assert body["error"]["code"] == "payload_too_large"
    assert r.headers.get_list("x-request-id") == [body["request_id"]]


def test_oversized_upload_without_content_length(make_client, generated_audio):
    # TestClient delivers the body in one message, so this covers the no-Content-Length branch;
    # incremental cut-off of a real chunked stream was verified with curl + uvicorn (F-012).
    client = make_client(max_upload_bytes=20_000)
    data = generated_audio["query_wav"].read_bytes()
    boundary = "testboundary1234"
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="q.wav"\r\n'
            f"Content-Type: audio/wav\r\n\r\n"
        ).encode()
        + data
        + f"\r\n--{boundary}--\r\n".encode()
    )

    def chunks():  # no Content-Length → transfer-encoding: chunked
        for i in range(0, len(body), 8192):
            yield body[i : i + 8192]

    r = client.post(
        URL, content=chunks(), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    assert r.status_code == 413
    _check_shape(r.json())
    assert r.json()["error"]["code"] == "payload_too_large"


def test_invalid_source_value_keeps_recognition_shape(client, generated_audio):
    r = client.post(URL, files=upload(generated_audio["query_m4a"]), data={"source": "x\nFAKE"})
    assert r.status_code == 422
    body = r.json()
    _check_shape(body)
    assert body["status"] == "invalid_input"
    assert body["error"]["code"] == "invalid_request"


def test_audio_sent_as_text_field_keeps_recognition_shape(client):
    r = client.post(URL, data={"audio": "not a file"})
    body = r.json()
    _check_shape(body)
    assert body["status"] == "invalid_input"


def test_malformed_multipart_keeps_recognition_shape(client):
    r = client.post(URL, content=b"garbage", headers={"Content-Type": "multipart/form-data"})
    assert 400 <= r.status_code < 500
    body = r.json()
    _check_shape(body)
    assert body["status"] == "invalid_input"


def test_unhandled_exception_keeps_shape_and_request_id(make_client, generated_audio):
    class BrokenStatus(StubProvider):
        def status(self):
            raise RuntimeError("boom")

    client = make_client(provider=BrokenStatus())
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 500
    body = r.json()
    _check_shape(body)
    assert body["status"] == "error"
    assert body["error"]["code"] == "internal_error"
    assert "boom" not in r.text
    assert r.headers["x-request-id"] == body["request_id"]


def test_decode_timeout_is_504(make_client, generated_audio):
    client = make_client(decode_timeout_seconds=0.0001)
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 504
    body = r.json()
    _check_shape(body)
    assert body["status"] == "error"
    assert body["error"]["code"] == "processing_timeout"


def test_ffmpeg_details_not_returned_to_client(client, generated_audio):
    r = client.post(URL, files=upload(generated_audio["truncated_m4a"]))
    message = r.json()["error"]["message"]
    assert "/" not in message and "0x" not in message


def _ingest(client, path, title="Song", artist="Artist"):
    r = client.post(
        "/v1/catalog/tracks",
        files=upload(path),
        data={"title": title, "artist": artist},
        headers=auth(),
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_catalog_empty_is_provider_unavailable(make_client, generated_audio):
    client = make_client(provider=StubProvider())
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 503
    body = r.json()
    assert body["error"]["code"] == "catalog_empty"
    assert body["provider"] == "stub"


def test_provider_not_ready(make_client, generated_audio):
    client = make_client(provider=StubProvider(ready=False))
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "provider_not_ready"


def test_matched_response_shape(make_client, generated_audio):
    provider = StubProvider()
    client = make_client(provider=provider)
    track = _ingest(client, generated_audio["reference_a_m4a"], "Ref A", "Artist A")
    provider.match_track_id = track["id"]

    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 200
    body = r.json()
    _check_shape(body)
    assert body["status"] == "matched"
    assert body["provider"] == "stub"
    assert body["provider_kind"] == "self_hosted_model"
    assert body["model_id"] == provider.model_info().model_id
    assert body["track"]["id"] == track["id"]
    assert body["track"]["title"] == "Ref A"
    assert body["confidence"] is None  # never fabricated
    assert body["matched_offset_seconds"] == 3.0
    assert body["error"] is None


def test_no_match(make_client, generated_audio):
    provider = StubProvider()
    client = make_client(provider=provider)
    _ingest(client, generated_audio["reference_a_m4a"])
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "no_match"
    assert body["track"] is None


def test_index_db_inconsistency_is_an_error_not_a_match(make_client, generated_audio):
    provider = StubProvider()
    client = make_client(provider=provider)
    _ingest(client, generated_audio["reference_a_m4a"])
    provider.match_track_id = "trk_does_not_exist"
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 500
    assert r.json()["status"] == "error"
    assert r.json()["error"]["code"] == "internal_error"


def test_provider_exception_is_internal_error(make_client, generated_audio):
    provider = StubProvider()
    client = make_client(provider=provider)
    _ingest(client, generated_audio["reference_a_m4a"])
    provider.fail_recognize = True
    r = client.post(URL, files=upload(generated_audio["query_m4a"]))
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"


@pytest.mark.parametrize("name", ["query_m4a", "not_audio", "truncated_m4a", "silence_wav"])
def test_query_audio_is_not_retained(client, generated_audio, name):
    client.post(URL, files=upload(generated_audio[name]))
    tmp_dir = client.ctx.settings.tmp_dir
    assert list(tmp_dir.iterdir()) == []
