from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models import FocusSession
from tests.conftest import default_category, record_completed_session


def test_daily_series_uses_real_completed_sessions(env):
    record_completed_session(env, minutes=30, day_offset=0)
    record_completed_session(env, minutes=45, day_offset=1)
    record_completed_session(env, minutes=20, day_offset=1)

    payload = env.client.get("/api/v1/analytics/daily?days=7").json()
    assert payload["days"] == 7
    assert len(payload["points"]) == 7

    by_date = {point["date"]: point for point in payload["points"]}
    assert by_date["2026-11-26"]["focusedSeconds"] == 1800
    assert by_date["2026-11-26"]["sessions"] == 1
    assert by_date["2026-11-25"]["focusedSeconds"] == 65 * 60
    assert by_date["2026-11-25"]["sessions"] == 2
    assert by_date["2026-11-24"]["focusedSeconds"] == 0


def test_empty_database_returns_zeroed_analytics(client):
    daily = client.get("/api/v1/analytics/daily?days=7").json()
    assert sum(point["focusedSeconds"] for point in daily["points"]) == 0

    overview = client.get("/api/v1/analytics/overview").json()
    assert overview["todayFocusedSeconds"] == 0
    assert overview["topCategory"] is None
    assert overview["recentSessions"] == []
    assert overview["focusScore"] is None
    assert overview["focusScoreStatus"] == "insufficient_data"

    categories = client.get("/api/v1/analytics/categories").json()
    assert categories["slices"] == []


def test_interrupted_time_is_reported_separately(env):
    record_completed_session(env, minutes=30, interruptions=[("phone", 180)])
    point = env.client.get("/api/v1/analytics/daily?days=1").json()["points"][0]
    assert point["focusedSeconds"] == 30 * 60
    assert point["interruptedSeconds"] == 180

    score = env.client.get("/api/v1/analytics/focus-score").json()
    # Insufficient data, but the ratios are still computed from real numbers.
    assert score["focusRatio"] == round(1800 / 1980, 4)
    assert score["interruptedSeconds"] == 180


def test_weekly_and_monthly_series(env):
    record_completed_session(env, minutes=30)
    record_completed_session(env, minutes=30, day_offset=10)
    record_completed_session(env, minutes=30, day_offset=40)

    weekly = env.client.get("/api/v1/analytics/weekly?weeks=8").json()
    assert weekly["weeks"] == 8
    # Eight contiguous calendar weeks, including weeks with no sessions.
    assert len(weekly["points"]) == 8
    assert weekly["points"][-1]["weekStart"] == "2026-11-23"
    assert sum(point["sessions"] for point in weekly["points"]) == 3

    monthly = env.client.get("/api/v1/analytics/monthly?months=3").json()
    assert len(monthly["points"]) == 3
    assert monthly["points"][0]["month"] == "2026-09"
    assert monthly["points"][-1]["month"] == "2026-11"
    assert monthly["points"][-1]["sessions"] == 2


def test_category_distribution_shares(env):
    category = default_category(env.client)
    record_completed_session(env, minutes=30, category_id=category["id"])
    record_completed_session(env, minutes=60)

    payload = env.client.get("/api/v1/analytics/categories?days=7").json()
    assert payload["totalFocusedSeconds"] == 5400
    shares = {item["name"]: item for item in payload["slices"]}
    assert shares[category["name"]]["share"] == round(1800 / 5400, 4)
    assert shares["Uncategorized"]["share"] == round(3600 / 5400, 4)
    assert payload["slices"][0]["name"] == "Uncategorized"  # sorted by focus time


def test_focus_score_formula(env):
    for _ in range(3):
        record_completed_session(env, minutes=10)  # 600s focused, no interruptions
    record_completed_session(env, minutes=10, cancel=True)

    payload = env.client.get("/api/v1/analytics/focus-score").json()
    assert payload["status"] == "available"
    assert payload["focusedSeconds"] == 1800
    assert payload["interruptedSeconds"] == 0
    assert payload["focusRatio"] == 1.0
    assert payload["consistencyRatio"] == 0.75
    # 100 * (0.8 * 1 + 0.2 * 0.75) = 95
    assert payload["score"] == 95.0
    assert [component["key"] for component in payload["components"]] == [
        "focus_ratio",
        "consistency_ratio",
    ]


def test_focus_score_requires_minimum_data(env):
    record_completed_session(env, minutes=10)
    record_completed_session(env, minutes=10)
    payload = env.client.get("/api/v1/analytics/focus-score").json()
    assert payload["score"] is None
    assert payload["status"] == "insufficient_data"


def test_focus_score_ignores_paused_time(env, clock):
    session = env.client.post(
        "/api/v1/sessions", json={"title": "Pause heavy"}
    ).json()
    clock.advance(600)
    env.client.post(f"/api/v1/sessions/{session['id']}/pause")
    clock.advance(1800)
    env.client.post(f"/api/v1/sessions/{session['id']}/resume")
    clock.advance(600)
    env.client.post(f"/api/v1/sessions/{session['id']}/complete")
    for _ in range(2):
        record_completed_session(env, minutes=10)

    payload = env.client.get("/api/v1/analytics/focus-score").json()
    # 600s running + 600s resumed; the 1800s pause is excluded entirely.
    assert payload["focusedSeconds"] == 2400
    assert payload["interruptedSeconds"] == 0
    assert payload["score"] == 100.0


def test_overview_week_change_and_streak(env):
    record_completed_session(env, minutes=30, day_offset=0)
    record_completed_session(env, minutes=30, day_offset=1)
    record_completed_session(env, minutes=30, day_offset=9)

    overview = env.client.get("/api/v1/analytics/overview").json()
    assert overview["todaySessions"] == 1
    assert overview["todayFocusedSeconds"] == 1800
    assert overview["weekFocusedSeconds"] == 3600
    # 3600 now vs 1800 in the previous 7 day window.
    assert overview["weekChangePercent"] == 100.0
    assert overview["currentStreakDays"] == 2
    assert len(overview["weeklyTrend"]) == 7
    assert len(overview["recentSessions"]) == 3


def test_timezone_bucketing_shifts_day_boundary(env):
    session = record_completed_session(env, minutes=30)
    with env.Session() as db:
        row = db.get(FocusSession, session["id"])
        assert row is not None
        row.started_at = datetime(2026, 11, 25, 20, 30, tzinfo=timezone.utc)
        row.ended_at = row.started_at + timedelta(minutes=30)
        db.commit()

    utc_day = env.client.get("/api/v1/analytics/daily?days=2&tzOffsetMinutes=0").json()
    ist_day = env.client.get("/api/v1/analytics/daily?days=2&tzOffsetMinutes=-330").json()

    utc_points = {point["date"]: point for point in utc_day["points"]}
    ist_points = {point["date"]: point for point in ist_day["points"]}
    assert utc_points["2026-11-25"]["focusedSeconds"] == 1800
    assert utc_points["2026-11-26"]["focusedSeconds"] == 0
    # 20:30 UTC is already the 26th in India.
    assert ist_points["2026-11-26"]["focusedSeconds"] == 1800
    assert ist_points["2026-11-25"]["focusedSeconds"] == 0


def test_stored_offset_keeps_the_historical_day_after_a_clock_change(env):
    session = record_completed_session(env, minutes=30, tz_offset_minutes=-330)
    with env.Session() as db:
        row = db.get(FocusSession, session["id"])
        assert row is not None
        row.started_at = datetime(2026, 11, 25, 20, 30, tzinfo=timezone.utc)
        row.ended_at = row.started_at + timedelta(minutes=30)
        db.commit()

    # The viewer has since moved to UTC, but the session keeps the offset it
    # started under, so 20:30 UTC still counts as the 26th in India.
    shifted = env.client.get("/api/v1/analytics/daily?days=2&tzOffsetMinutes=0").json()
    points = {point["date"]: point for point in shifted["points"]}
    assert points["2026-11-26"]["focusedSeconds"] == 1800
    assert points["2026-11-25"]["focusedSeconds"] == 0

    insights = env.client.get("/api/v1/analytics/insights?days=30&tzOffsetMinutes=0").json()
    assert insights["bestDay"]["date"] == "2026-11-26"


def test_insights_report_time_of_day_and_reasons(env):
    record_completed_session(
        env, minutes=40, interruptions=[("phone", 60), ("phone", 30), ("social_media", 120)]
    )
    payload = env.client.get("/api/v1/analytics/insights?days=30").json()
    assert payload["totalSessions"] == 1
    assert payload["bestDay"]["focusedSeconds"] == 40 * 60
    assert payload["timeOfDay"]["bestWindow"] == "Afternoon"
    reasons = {item["label"]: item for item in payload["interruptionReasons"]}
    assert reasons["Phone"]["count"] == 2
    assert reasons["Phone"]["seconds"] == 90
    assert payload["durationDistribution"]["longestSeconds"] == 40 * 60
