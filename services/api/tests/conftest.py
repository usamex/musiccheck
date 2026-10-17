from __future__ import annotations

import os
import sys
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from musiccheck_api import migrate
from musiccheck_api.config import Settings
from musiccheck_api.context import AppContext
from musiccheck_api.main import create_app
from musiccheck_recognition import RecognitionProvider

sys.path.insert(0, str(Path(__file__).parent))

ADMIN_TOKEN = "test-admin-token"
PG_URL = os.environ.get("MUSICCHECK_TEST_DATABASE_URL")


@pytest.fixture
def database_url(tmp_path: Path) -> Iterator[str]:
    """SQLite per test by default; PostgreSQL when MUSICCHECK_TEST_DATABASE_URL is set.

    Migrations (not create_all) build the schema, so every test also exercises Alembic.
    """
    if PG_URL:
        # The fixture drops every table: refuse anything that is not clearly a test database.
        assert PG_URL.rsplit("/", 1)[-1].split("?")[0].endswith("_test"), (
            "MUSICCHECK_TEST_DATABASE_URL must name a database ending in '_test'"
        )
        migrate.downgrade(PG_URL, "base")
        migrate.upgrade(PG_URL)
        yield PG_URL
        migrate.downgrade(PG_URL, "base")
    else:
        url = f"sqlite:///{tmp_path / 'test.db'}"
        migrate.upgrade(url)
        yield url


@pytest.fixture
def make_client(tmp_path: Path, database_url: str) -> Iterator[Callable[..., TestClient]]:
    clients: list[TestClient] = []

    def factory(
        provider: RecognitionProvider | None = None,
        admin_token: str | None = ADMIN_TOKEN,
        provider_error: str | None = None,
        **overrides: object,
    ) -> TestClient:
        settings = Settings(
            _env_file=None,
            database_url=database_url,
            data_dir=tmp_path / "data",
            catalog_admin_token=admin_token,
            **overrides,
        )
        ctx = AppContext.from_settings(settings, provider=provider)
        ctx.provider_error = provider_error
        client = TestClient(create_app(ctx=ctx))
        client.__enter__()
        clients.append(client)
        client.ctx = ctx  # type: ignore[attr-defined]
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)
        client.ctx.close()  # type: ignore[attr-defined]


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


def upload(path: Path, content_type: str = "audio/mp4") -> dict:
    return {"audio": (path.name, path.read_bytes(), content_type)}
