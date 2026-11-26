"""Unit tests for the timestamp arithmetic."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import FocusSession, Interruption, SessionStatus
from app.services.session_clock import compute_metrics, serialize_session

T0 = datetime(2026, 11, 26, 9, 0, 0, tzinfo=timezone.utc)


def build_session(**overrides) -> FocusSession:
    session = FocusSession(
        id=1,
        user_id=1,
        title="Engine test",
        status=SessionStatus.ACTIVE.value,
        started_at=T0,
        last_resumed_at=T0,
        accumulated_active_seconds=0.0,
        paused_seconds=0.0,
        focused_duration=0.0,
        interrupted_duration=0.0,
    )
    for key, value in overrides.items():
        setattr(session, key, value)
    return session


def test_active_elapsed_uses_timestamps() -> None:
    session = build_session()
    metrics = compute_metrics(session, now=T0 + timedelta(minutes=10))
    assert metrics.focused_seconds == 600
    assert metrics.elapsed_seconds == 600
    assert metrics.interrupted_seconds == 0


def test_paused_time_is_not_focused_time() -> None:
    session = build_session(
        status=SessionStatus.PAUSED.value,
        accumulated_active_seconds=300.0,
        last_resumed_at=None,
        paused_at=T0 + timedelta(minutes=5),
    )
    metrics = compute_metrics(session, now=T0 + timedelta(minutes=20))
    assert metrics.focused_seconds == 300
    assert metrics.paused_seconds == 900
    assert metrics.elapsed_seconds == 1200


def test_open_interruption_freezes_focused_time() -> None:
    session = build_session()
    interruption = Interruption(
        session_id=1,
        reason="phone",
        started_at=T0 + timedelta(minutes=2),
        ended_at=None,
    )
    session.interruptions = [interruption]
    metrics = compute_metrics(session, now=T0 + timedelta(minutes=5))
    assert metrics.interrupted_seconds == 180
    # 300s active minus 180s distracted.
    assert metrics.focused_seconds == 120


def test_interruption_cannot_exceed_active_time() -> None:
    session = build_session()
    session.interruptions = [
        Interruption(session_id=1, reason="browsing", started_at=T0, ended_at=T0 + timedelta(minutes=10))
    ]
    metrics = compute_metrics(session, now=T0 + timedelta(minutes=4))
    assert metrics.interrupted_seconds == 240
    assert metrics.focused_seconds == 0


def test_closed_session_uses_frozen_totals() -> None:
    session = build_session(
        status=SessionStatus.COMPLETED.value,
        ended_at=T0 + timedelta(minutes=30),
        focused_duration=1200.0,
        interrupted_duration=300.0,
        paused_seconds=120.0,
    )
    metrics = compute_metrics(session, now=T0 + timedelta(hours=5))
    assert metrics.focused_seconds == 1200
    assert metrics.interrupted_seconds == 300
    assert metrics.paused_seconds == 120
    assert metrics.elapsed_seconds == 1800


def test_elapsed_never_negative_for_future_timestamps() -> None:
    session = build_session(started_at=T0 + timedelta(hours=1))
    metrics = compute_metrics(session, now=T0)
    assert metrics.elapsed_seconds == 0


def test_serialized_interruption_reports_live_duration() -> None:
    session = build_session()
    session.interruptions = [
        Interruption(
            id=7,
            session_id=1,
            reason="other",
            custom_reason="Delivery at the door",
            started_at=T0,
            ended_at=None,
        )
    ]
    payload = serialize_session(session, now=T0 + timedelta(seconds=90))
    assert payload["interruptions"][0]["duration_seconds"] == 90
    assert payload["interruptions"][0]["label"] == "Delivery at the door"
    assert payload["interruptions"][0]["is_open"] is True
