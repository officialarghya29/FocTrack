from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        # The test suite and the local server share a single file; connection
        # sharing avoids "database is locked" under threaded requests.
        return {"connect_args": {"check_same_thread": False}}
    # Hosted PostgreSQL drops idle connections (and Neon suspends an idle
    # compute), so stale connections are checked and recycled rather than
    # surfacing as a 500 on the first request after a quiet period.
    return {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 5,
        "max_overflow": 5,
    }


engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
    """SQLite ignores foreign keys unless they are switched on per connection."""
    module = type(dbapi_connection).__module__
    if "sqlite" not in module:
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
