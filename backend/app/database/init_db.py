"""Database bootstrap.

The application always runs Alembic migrations to `head` on startup, so the
schema is versioned from the first launch and stays reproducible in
deployments. Tests use `create_all` against an isolated database instead.
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.config import settings
from app.database.base import Base
from app.database.session import engine
from app.models import *  # noqa: F401,F403  (register models on Base.metadata)

logger = logging.getLogger("foctrack")

BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def run_migrations() -> None:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(config, "head")


def init_database() -> None:
    if ALEMBIC_INI.exists():
        run_migrations()
        logger.info("Migrations applied (head).")
    else:  # pragma: no cover - defensive fallback for packaged builds
        Base.metadata.create_all(bind=engine)


def create_all() -> None:
    """Used by tests and tooling where migrations are unnecessary."""
    Base.metadata.create_all(bind=engine)


def tables_exist() -> bool:
    inspector = inspect(engine)
    return "focus_sessions" in inspector.get_table_names()
