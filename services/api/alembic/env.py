"""Alembic environment: uses MUSICCHECK_DATABASE_URL via the app's Settings."""

from __future__ import annotations

from alembic import context
from musiccheck_api.config import Settings
from musiccheck_api.db import Base, make_engine

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    return config.attributes.get("database_url") or Settings().database_url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = make_engine(_url())
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
