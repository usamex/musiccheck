"""Apply Alembic migrations programmatically (`python -m musiccheck_api.migrate`)."""

from __future__ import annotations

import os
from pathlib import Path

from alembic import command
from alembic.config import Config

from .config import Settings


def alembic_config(database_url: str | None = None) -> Config:
    ini = Path(os.environ.get("MUSICCHECK_ALEMBIC_INI", Path(__file__).parents[2] / "alembic.ini"))
    if not ini.is_file():
        raise FileNotFoundError(f"alembic.ini not found at {ini}; set MUSICCHECK_ALEMBIC_INI")
    cfg = Config(str(ini))
    cfg.attributes["database_url"] = database_url or Settings().database_url
    return cfg


def upgrade(database_url: str | None = None, revision: str = "head") -> None:
    command.upgrade(alembic_config(database_url), revision)


def downgrade(database_url: str | None = None, revision: str = "base") -> None:
    command.downgrade(alembic_config(database_url), revision)


if __name__ == "__main__":
    Settings().ensure_dirs()  # the default SQLite URL lives under data_dir
    upgrade()
