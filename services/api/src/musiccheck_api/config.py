"""Environment-based configuration. Every setting is read from ``MUSICCHECK_*`` env vars
(or a ``.env`` file in the working directory). See services/api/README.md for the table."""

from __future__ import annotations

from functools import cached_property
from pathlib import Path

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIB = 1024 * 1024


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MUSICCHECK_", env_file=".env", extra="ignore")

    env: str = "development"
    log_level: str = "INFO"

    #: Default: SQLite file inside ``data_dir`` (derived below).
    database_url: str = ""
    #: Resolved to an absolute path so stored references survive a different working directory.
    data_dir: Path = Path("./data")

    # Recognition
    recognition_provider: str = "none"
    # Sample rate used to validate query audio when no provider is configured.
    validation_sample_rate: int = 16_000

    # Query (identify) limits
    max_upload_bytes: int = 10 * MIB
    min_query_seconds: float = 2.0
    max_query_seconds: float = 30.0
    # Heuristic silence gate, NOT a recognition threshold. Calibrate with real phone
    # recordings (backlog QA-3). -60 dBFS RMS only rejects (near-)digital silence.
    silence_dbfs: float = -60.0
    decode_timeout_seconds: float = 15.0

    # Catalog (reference ingestion) limits
    catalog_admin_token: SecretStr | None = None
    max_reference_upload_bytes: int = 200 * MIB
    max_reference_seconds: float = 20 * 60.0
    reference_decode_timeout_seconds: float = 120.0

    cors_allow_origins: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _derive_paths(self) -> Settings:
        self.data_dir = self.data_dir.expanduser().resolve()
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data_dir / 'musiccheck.db'}"
        return self

    @field_validator("catalog_admin_token", mode="before")
    @classmethod
    def _empty_token_means_disabled(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return value

    @cached_property
    def catalog_audio_dir(self) -> Path:
        return self.data_dir / "catalog" / "audio"

    @cached_property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    def ensure_dirs(self) -> None:
        for directory in (self.data_dir, self.catalog_audio_dir, self.tmp_dir):
            directory.mkdir(parents=True, exist_ok=True)

    def data_path(self, stored: str) -> Path:
        """Resolve a path stored in the DB (relative to ``data_dir``; absolute kept as is)."""
        path = Path(stored)
        return path if path.is_absolute() else self.data_dir / path
