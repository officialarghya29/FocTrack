from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.config import normalize_database_url
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models import FocusSession
from app.services import analytics_service, backup_service, demo_service, profile_service
from app.services import session_clock, session_service

BASE_TIME = datetime(2026, 11, 26, 12, 0, 0, tzinfo=timezone.utc)


class FakeClock:
    """Controllable wall clock shared by every service under test."""

    def __init__(self) -> None:
        self.offset = timedelta(0)

    def now(self) -> datetime:
        return BASE_TIME + self.offset

    def advance(self, seconds: float) -> None:
        self.offset += timedelta(seconds=seconds)

    def reset(self) -> None:
        self.offset = timedelta(0)


@pytest.fixture
def clock(monkeypatch) -> FakeClock:
    fake = FakeClock()
    for module in (
        session_service,
        session_clock,
        analytics_service,
        demo_service,
        backup_service,
        profile_service,
    ):
        monkeypatch.setattr(module, "utcnow", fake.now)
    return fake


@pytest.fixture
def env(tmp_path, clock):
    # The suite runs on SQLite by default. Set FOCTRACK_TEST_DATABASE_URL to a
    # PostgreSQL DSN to run the identical assertions against the deployed
    # dialect.
    external_url = os.environ.get("FOCTRACK_TEST_DATABASE_URL")
    if external_url:
        url = normalize_database_url(external_url)
        engine = create_engine(url, pool_pre_ping=True)
        Base.metadata.drop_all(engine)
    else:
        url = f"sqlite:///{tmp_path / 'test.db'}"
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _fk(dbapi_connection, record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX uq_open_session_per_user ON focus_sessions (user_id) "
            "WHERE status IN ('ACTIVE', 'PAUSED')"
        )

    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    client = TestClient(app)
    yield SimpleNamespace(client=client, Session=TestingSession, engine=engine, clock=clock)
    app.dependency_overrides.clear()
    client.close()
    engine.dispose()


@pytest.fixture
def client(env):
    return env.client


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def default_category(client) -> dict:
    categories = client.get("/api/v1/categories").json()
    return categories[0]


def start_session(client, **overrides) -> dict:
    payload = {"title": "Deep work block"}
    payload.update(overrides)
    response = client.post("/api/v1/sessions", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def backdate(env, session_id: int, days: int) -> None:
    delta = timedelta(days=days)
    with env.Session() as db:
        session = db.get(FocusSession, session_id)
        assert session is not None
        session.started_at = session.started_at - delta
        if session.ended_at is not None:
            session.ended_at = session.ended_at - delta
        for interruption in session.interruptions:
            interruption.started_at = interruption.started_at - delta
            if interruption.ended_at is not None:
                interruption.ended_at = interruption.ended_at - delta
        db.commit()


def record_completed_session(
    env,
    *,
    title: str = "Deep work",
    minutes: int = 25,
    day_offset: int = 0,
    cancel: bool = False,
    category_id: int | None = None,
    interruptions: list[tuple[str, int]] | None = None,
) -> dict:
    """Create a finished session with exact durations using the fake clock."""
    clock = env.clock
    clock.reset()
    payload = {"title": title}
    if category_id is not None:
        payload["categoryId"] = category_id
    session = start_session(env.client, **payload)
    session_id = session["id"]

    for reason, seconds in interruptions or []:
        response = env.client.post(
            f"/api/v1/sessions/{session_id}/interruptions",
            json={"reason": reason},
        )
        assert response.status_code == 201, response.text
        clock.advance(seconds)
        interruption_id = response.json()["interruptions"][-1]["id"]
        ended = env.client.post(f"/api/v1/interruptions/{interruption_id}/end")
        assert ended.status_code == 200, ended.text

    clock.advance(minutes * 60)
    endpoint = "cancel" if cancel else "complete"
    response = env.client.post(f"/api/v1/sessions/{session_id}/{endpoint}")
    assert response.status_code == 200, response.text

    if day_offset:
        backdate(env, session_id, day_offset)
    detail = env.client.get(f"/api/v1/sessions/{session_id}")
    assert detail.status_code == 200, detail.text
    return detail.json()
