"""Application configuration.

All configuration is environment driven. Every value has a sensible local
default so the project runs with zero configuration in development.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


def normalize_database_url(value: str) -> str:
    """Accept the DSN formats hosting providers hand out.

    Providers export `postgres://` or `postgresql://` URLs, which SQLAlchemy
    would otherwise resolve to the psycopg2 driver. This build ships psycopg 3,
    so the driver is pinned explicitly.
    """
    url = value.strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_prefix="FOCTRACK_",
        extra="ignore",
    )

    app_name: str = "FocTrack API"
    version: str = "1.1.0"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"

    # SQLite is the default. Point this at a PostgreSQL DSN to migrate the
    # data layer without touching application code.
    database_url: str = f"sqlite:///{BACKEND_DIR / 'focustrack.db'}"

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, value: str) -> str:
        return normalize_database_url(value)

    # Comma separated list of allowed browser origins.
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )

    # --- authentication ----------------------------------------------------
    # A development-only fallback keeps the local server zero-configuration.
    # Production refuses to start unless a real secret of at least 32
    # characters is supplied through the environment.
    jwt_secret: str = "development-only-insecure-secret-change-me"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    google_client_id: str = ""
    # Rate limiting needs the real client address. Render terminates TLS and
    # forwards X-Forwarded-For; only enable this behind a trusted proxy.
    trust_forwarded_for: bool = False

    # Bounds used by the validation layer.
    analytics_max_days: int = 366

    @model_validator(mode="after")
    def _production_secret(self) -> "Settings":
        if self.environment == "production" and len(self.jwt_secret) < 32:
            raise ValueError(
                "FOCTRACK_JWT_SECRET must be set to at least 32 characters in production."
            )
        return self

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",")]
        return [origin for origin in origins if origin]


settings = Settings()
