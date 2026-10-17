from __future__ import annotations

import json
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from musiccheck_api.db import Base, make_engine
from musiccheck_api.main import create_app

REPO = Path(__file__).resolve().parents[3]
OPENAPI = REPO / "packages" / "shared" / "openapi.json"


def test_migrations_match_models(database_url):
    engine = make_engine(database_url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    engine.dispose()
    assert diff == [], f"Models and Alembic migrations differ; add a migration: {diff}"


def test_committed_openapi_is_current():
    current = create_app().openapi()
    committed = json.loads(OPENAPI.read_text())
    assert committed == current, "API changed: run scripts/export-openapi.sh and commit the result"
