"""Database bootstrap.

The application always runs Alembic migrations to `head` on startup, so the
schema is versioned from the first launch and stays reproducible in
deployments. Tests use `create_all` against an isolated database instead.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError

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


MIGRATION_ATTEMPTS = 4
MIGRATION_RETRY_SECONDS = 3.0


def init_database() -> None:
    """Apply migrations, tolerating a database that is still waking up.

    A hosted database can refuse the first connection after suspending, and a
    failed startup takes the whole service down. Retrying briefly keeps a cold
    start from turning into a failed deployment; a genuinely broken database
    still raises after the final attempt.
    """
    if not ALEMBIC_INI.exists():  # pragma: no cover - packaged fallback
        Base.metadata.create_all(bind=engine)
        return

    for attempt in range(1, MIGRATION_ATTEMPTS + 1):
        try:
            run_migrations()
            logger.info("Migrations applied (head).")
            return
        except SQLAlchemyError as exc:
            if attempt == MIGRATION_ATTEMPTS:
                logger.error("Database unreachable after %s attempts.", attempt)
                raise
            logger.warning(
                "Database not ready (attempt %s/%s): %s",
                attempt,
                MIGRATION_ATTEMPTS,
                exc.__class__.__name__,
            )
            time.sleep(MIGRATION_RETRY_SECONDS)


def create_all() -> None:
    """Used by tests and tooling where migrations are unnecessary."""
    Base.metadata.create_all(bind=engine)


def tables_exist() -> bool:
    inspector = inspect(engine)
    return "focus_sessions" in inspector.get_table_names()
