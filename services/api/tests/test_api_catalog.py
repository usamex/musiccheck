from __future__ import annotations

from pathlib import Path

from stub_provider import StubProvider

from conftest import auth, upload

URL = "/v1/catalog/tracks"


def test_write_requires_token(client, generated_audio):
    r = client.post(
        URL, files=upload(generated_audio["reference_a_m4a"]), data={"title": "t", "artist": "a"}
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"
    r = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "t", "artist": "a"},
        headers={"Authorization": "Bearer wrong"},
    )
    assert r.status_code == 401


def test_write_disabled_without_configured_token(make_client, generated_audio):
    client = make_client(admin_token=None)
    r = client.post(
        URL, files=upload(generated_audio["reference_a_m4a"]), data={"title": "t", "artist": "a"}
    )
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "catalog_admin_disabled"


def test_unauthenticated_large_upload_cut_off_early(client, generated_audio):
    big = generated_audio["long_wav"]  # ~4 MB, above the 1 MiB unauthenticated cap
    assert big.stat().st_size > 1024 * 1024
    r = client.post(URL, files=upload(big, "audio/wav"), data={"title": "t", "artist": "a"})
    assert r.status_code == 413


def test_ingest_get_list_delete_roundtrip(client, generated_audio):
    r = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={
            "title": " Ref A ",
            "artist": "Artist A",
            "recording_id": "test:0001",
            "source": "generated",
            "license": "CC0-1.0",
        },
        headers=auth(),
    )
    assert r.status_code == 201, r.text
    track = r.json()
    assert track["id"].startswith("trk_")
    assert track["title"] == "Ref A"
    assert track["album"] is None
    assert abs(track["duration_seconds"] - 12.0) < 0.1
    assert len(track["audio_sha256"]) == 64
    assert track["indexing"] == {
        "status": "pending",
        "model_id": None,
        "segment_count": None,
        "error": None,
        "updated_at": None,
    }

    stored = Path(client.ctx.settings.catalog_audio_dir) / f"{track['audio_sha256']}.m4a"
    assert stored.is_file()

    assert client.get(f"{URL}/{track['id']}").json() == track
    listing = client.get(URL).json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == track["id"]

    assert client.delete(f"{URL}/{track['id']}").status_code == 401
    assert client.delete(f"{URL}/{track['id']}", headers=auth()).status_code == 204
    assert not stored.exists()
    r = client.get(f"{URL}/{track['id']}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "track_not_found"


def test_ingest_is_idempotent_on_audio_content(client, generated_audio):
    first = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    )
    second = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "Other", "artist": "C"},
        headers=auth(),
    )
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert client.get(URL).json()["total"] == 1


def test_embedded_tags_fill_missing_metadata(client, generated_audio):
    r = client.post(URL, files=upload(generated_audio["tagged_m4a"]), headers=auth())
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["title"], body["artist"], body["album"]) == (
        "Tagged Title",
        "Tagged Artist",
        "Tagged Album",
    )


def test_missing_metadata_rejected(client, generated_audio):
    r = client.post(URL, files=upload(generated_audio["reference_a_m4a"]), headers=auth())
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "missing_metadata"


def test_invalid_reference_audio(client, generated_audio):
    r = client.post(
        URL,
        files=upload(generated_audio["not_audio"]),
        data={"title": "t", "artist": "a"},
        headers=auth(),
    )
    assert r.status_code == 415
    r = client.post(
        URL,
        files=upload(generated_audio["silence_wav"]),
        data={"title": "t", "artist": "a"},
        headers=auth(),
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "audio_silent"
    assert list(client.ctx.settings.catalog_audio_dir.iterdir()) == []


def test_indexing_with_provider_records_model_and_segments(make_client, generated_audio):
    provider = StubProvider()
    client = make_client(provider=provider)
    r = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    )
    track = r.json()
    assert track["indexing"]["status"] == "indexed"
    assert track["indexing"]["model_id"] == provider.model_info().model_id
    assert track["indexing"]["segment_count"] == 12
    assert provider.indexed == {track["id"]: 12}

    assert client.delete(f"{URL}/{track['id']}", headers=auth()).status_code == 204
    assert provider.removed == [track["id"]]


def test_indexing_failure_is_recorded(make_client, generated_audio):
    client = make_client(provider=StubProvider(fail_index=True))
    r = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    )
    assert r.status_code == 201
    indexing = r.json()["indexing"]
    assert indexing["status"] == "failed"
    assert "stub index failure" in indexing["error"]


def test_list_pagination_validation(client):
    r = client.get(URL, params={"limit": 0})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_request"


def test_blank_admin_token_means_disabled(make_client, generated_audio):
    client = make_client(admin_token="  ")
    r = client.post(URL, files=upload(generated_audio["reference_a_m4a"]), headers=auth())
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "catalog_admin_disabled"


def test_reference_longer_than_limit_rejected_by_decoded_length(make_client, generated_audio):
    client = make_client(max_reference_seconds=5.0)
    r = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "audio_too_long"
    assert list(client.ctx.settings.catalog_audio_dir.iterdir()) == []


def test_long_album_tag_is_truncated(client, generated_audio):
    r = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B", "album": "x" * 500},
        headers=auth(),
    )
    assert r.status_code == 201, r.text


def test_stored_path_is_relative_to_data_dir(client, generated_audio):
    from musiccheck_api.db import Track

    track = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    ).json()
    with client.ctx.session_factory() as session:
        row = session.get(Track, track["id"])
        assert not Path(row.audio_path).is_absolute()
        assert client.ctx.settings.data_path(row.audio_path).is_file()


def test_partial_reference_file_is_replaced(client, generated_audio):
    import hashlib

    data = generated_audio["reference_a_m4a"].read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    partial = client.ctx.settings.catalog_audio_dir / f"{sha}.m4a"
    partial.write_bytes(data[:100])  # simulate a crash mid-copy in an earlier run
    r = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    )
    assert r.status_code == 201
    assert partial.read_bytes() == data
    assert [p.name for p in partial.parent.iterdir()] == [partial.name]  # no .partial- leftovers


def test_delete_refused_when_configured_provider_unavailable(make_client, generated_audio):
    provider = StubProvider()
    client = make_client(provider=provider, recognition_provider="stub")
    track = client.post(
        URL,
        files=upload(generated_audio["reference_a_m4a"]),
        data={"title": "A", "artist": "B"},
        headers=auth(),
    ).json()
    provider.ready = False
    r = client.delete(f"{URL}/{track['id']}", headers=auth())
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "provider_unavailable"
    assert client.get(f"{URL}/{track['id']}").status_code == 200
