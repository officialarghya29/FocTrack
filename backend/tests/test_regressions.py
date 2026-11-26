"""Regression tests for defects found during the full-code audit."""

from __future__ import annotations

from tests.conftest import record_completed_session, start_session


def test_previous_week_window_is_exactly_seven_days(env):
    for offset in range(7):
        record_completed_session(env, minutes=30, day_offset=offset)
    for offset in range(7, 14):
        record_completed_session(env, minutes=60, day_offset=offset)

    overview = env.client.get("/api/v1/analytics/overview").json()
    assert overview["weekFocusedSeconds"] == 7 * 30 * 60
    # 12600 seconds this week against 25200 seconds last week.
    assert overview["weekChangePercent"] == -50.0


def test_week_and_month_series_are_contiguous(env):
    record_completed_session(env, minutes=30)

    weekly = env.client.get("/api/v1/analytics/weekly?weeks=8").json()
    assert len(weekly["points"]) == 8
    assert weekly["points"][0]["weekStart"] == "2026-10-05"
    assert weekly["points"][-1]["weekStart"] == "2026-11-23"

    monthly = env.client.get("/api/v1/analytics/monthly?months=6").json()
    assert len(monthly["points"]) == 6
    assert monthly["points"][0]["month"] == "2026-06"
    assert monthly["points"][-1]["month"] == "2026-11"
    assert sum(point["sessions"] for point in monthly["points"]) == 1


def test_whitespace_only_titles_are_rejected(env):
    response = env.client.post("/api/v1/sessions", json={"title": "   "})
    assert response.status_code == 422
    assert "title" in response.json()["detail"]

    session = start_session(env.client)
    response = env.client.patch(
        f"/api/v1/sessions/{session['id']}", json={"title": " \t "}
    )
    assert response.status_code == 422


def test_search_treats_wildcards_as_literal_text(env):
    record_completed_session(env, title="100% done")
    record_completed_session(env, title="100 done")

    percent = env.client.get("/api/v1/sessions", params={"search": "100%"}).json()
    assert percent["total"] == 1
    assert percent["items"][0]["title"] == "100% done"

    underscore = env.client.get("/api/v1/sessions", params={"search": "_"}).json()
    assert underscore["total"] == 0


def test_health_fails_when_database_is_unavailable(client, monkeypatch):
    from app.api.v1.endpoints import health

    def broken_session():
        raise RuntimeError("database is gone")

    monkeypatch.setattr(health, "SessionLocal", broken_session)
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"


def test_deleting_an_interruption_restores_frozen_focus_time(env):
    session = record_completed_session(
        env, minutes=25, interruptions=[("phone", 120)]
    )
    assert session["focusedSeconds"] == 25 * 60
    assert session["interruptedSeconds"] == 120

    interruption_id = session["interruptions"][0]["id"]
    response = env.client.delete(f"/api/v1/interruptions/{interruption_id}")
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["interruptedSeconds"] == 0
    assert updated["focusedSeconds"] == 25 * 60 + 120
    assert updated["interruptions"] == []

    overview = env.client.get("/api/v1/analytics/overview").json()
    assert overview["todayFocusedSeconds"] == 25 * 60 + 120
    assert overview["todayInterruptedSeconds"] == 0


def test_profile_email_is_trimmed_to_null(client):
    response = client.patch(
        "/api/v1/profile", json={"username": "Focus User", "email": "   "}
    )
    assert response.status_code == 200
    assert response.json()["email"] is None
