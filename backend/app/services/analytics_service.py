"""Analytics computed from stored sessions.

Aggregation happens in Python over the sessions inside the requested window.
That keeps one implementation across SQLite and PostgreSQL and makes the local
timezone bucketing exact; volumes for a personal tracker are small (thousands
of rows at most), so the trade-off is deliberate.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.analytics.focus_score import DEFAULT_WINDOW_DAYS, compute_focus_score
from app.core.clock import local_day_start, utcnow
from app.models import FocusSession, Interruption, SessionStatus, User
from app.services.session_clock import reason_label, serialize_session

COMPLETED = SessionStatus.COMPLETED.value
CANCELLED = SessionStatus.CANCELLED.value

UNCATEGORIZED = {"id": None, "name": "Uncategorized", "color": "#6B7681"}


def _to_local(ts: datetime, tz_offset_minutes: int) -> datetime:
    return ts + timedelta(minutes=-tz_offset_minutes)


def _sessions_between(
    db: Session, user_id: int, start: datetime, end: datetime
) -> list[FocusSession]:
    stmt = (
        select(FocusSession)
        .options(joinedload(FocusSession.category), selectinload(FocusSession.interruptions))
        .where(
            FocusSession.user_id == user_id,
            FocusSession.started_at >= start,
            FocusSession.started_at < end,
        )
        .order_by(FocusSession.started_at.asc())
    )
    return list(db.scalars(stmt).unique().all())


def _completed_in(
    db: Session, user_id: int, start: datetime, end: datetime
) -> list[FocusSession]:
    return [s for s in _sessions_between(db, user_id, start, end) if s.status == COMPLETED]


def _day_window(tz_offset_minutes: int, days: int) -> tuple[datetime, datetime, date]:
    today_local = _to_local(utcnow(), tz_offset_minutes).date()
    first = today_local - timedelta(days=days - 1)
    return local_day_start(first, tz_offset_minutes), local_day_start(
        today_local + timedelta(days=1), tz_offset_minutes
    ), first


def _sum_sessions(sessions: list[FocusSession]) -> tuple[float, float]:
    focused = sum(max(0.0, s.focused_duration or 0.0) for s in sessions)
    interrupted = sum(max(0.0, s.interrupted_duration or 0.0) for s in sessions)
    return round(focused, 3), round(interrupted, 3)


# --------------------------------------------------------------------------- #
# Daily / weekly / monthly trends
# --------------------------------------------------------------------------- #


def daily_series(
    db: Session, user: User, tz_offset_minutes: int, days: int
) -> dict:
    start, end, first_day = _day_window(tz_offset_minutes, days)
    sessions = _completed_in(db, user.id, start, end)

    buckets: dict[date, dict] = {
        first_day + timedelta(days=index): {
            "focused_seconds": 0.0,
            "interrupted_seconds": 0.0,
            "sessions": 0,
        }
        for index in range(days)
    }
    for session in sessions:
        day = _to_local(session.started_at, tz_offset_minutes).date()
        bucket = buckets.get(day)
        if bucket is None:
            continue
        bucket["focused_seconds"] += max(0.0, session.focused_duration or 0.0)
        bucket["interrupted_seconds"] += max(0.0, session.interrupted_duration or 0.0)
        bucket["sessions"] += 1

    points = [
        {
            # Weekday labels only make sense for a single week; longer ranges
            # would repeat "Mon, Tue…" and blur the axis.
            "label": day.strftime("%a") if days <= 7 else day.strftime("%d %b"),
            "date": day,
            "focused_seconds": round(value["focused_seconds"], 3),
            "interrupted_seconds": round(value["interrupted_seconds"], 3),
            "sessions": value["sessions"],
            "focus_score": None,
        }
        for day, value in sorted(buckets.items())
    ]
    return {
        "days": days,
        "start": first_day,
        "end": first_day + timedelta(days=days - 1),
        "points": points,
    }


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _month_start(day: date, months_back: int) -> date:
    index = day.year * 12 + (day.month - 1) - months_back
    return date(index // 12, index % 12 + 1, 1)


def weekly_series(db: Session, user: User, tz_offset_minutes: int, weeks: int) -> dict:
    """Calendar weeks, current week last, with empty weeks included."""
    today_local = _to_local(utcnow(), tz_offset_minutes).date()
    current_week = _week_start(today_local)
    first_week = current_week - timedelta(weeks=weeks - 1)
    start = local_day_start(first_week, tz_offset_minutes)
    end = local_day_start(current_week + timedelta(days=7), tz_offset_minutes)
    sessions = _completed_in(db, user.id, start, end)

    buckets: dict[date, dict] = {
        first_week + timedelta(weeks=index): {
            "focused_seconds": 0.0,
            "interrupted_seconds": 0.0,
            "sessions": 0,
        }
        for index in range(weeks)
    }
    for session in sessions:
        day = _to_local(session.started_at, tz_offset_minutes).date()
        bucket = buckets.get(_week_start(day))
        if bucket is None:
            continue
        bucket["focused_seconds"] += max(0.0, session.focused_duration or 0.0)
        bucket["interrupted_seconds"] += max(0.0, session.interrupted_duration or 0.0)
        bucket["sessions"] += 1

    points = [
        {
            "week_start": week_start,
            "label": week_start.strftime("%b %d"),
            "focused_seconds": round(value["focused_seconds"], 3),
            "interrupted_seconds": round(value["interrupted_seconds"], 3),
            "sessions": value["sessions"],
        }
        for week_start, value in sorted(buckets.items())
    ]
    return {"weeks": weeks, "points": points}


def monthly_series(db: Session, user: User, tz_offset_minutes: int, months: int) -> dict:
    """Calendar months, current month last, with empty months included."""
    today_local = _to_local(utcnow(), tz_offset_minutes).date()
    first_month = _month_start(today_local, months - 1)
    next_month = _month_start(today_local, -1)
    start = local_day_start(first_month, tz_offset_minutes)
    end = local_day_start(next_month, tz_offset_minutes)
    sessions = _completed_in(db, user.id, start, end)

    buckets: dict[str, dict] = {
        f"{_month_start(first_month, -index).year:04d}-"
        f"{_month_start(first_month, -index).month:02d}": {
            "focused_seconds": 0.0,
            "interrupted_seconds": 0.0,
            "sessions": 0,
        }
        for index in range(months)
    }
    for session in sessions:
        local_day = _to_local(session.started_at, tz_offset_minutes).date()
        key = f"{local_day.year:04d}-{local_day.month:02d}"
        bucket = buckets.get(key)
        if bucket is None:
            continue
        bucket["focused_seconds"] += max(0.0, session.focused_duration or 0.0)
        bucket["interrupted_seconds"] += max(0.0, session.interrupted_duration or 0.0)
        bucket["sessions"] += 1

    points = [
        {
            "month": key,
            "label": datetime.strptime(key, "%Y-%m").strftime("%b %Y"),
            "focused_seconds": round(value["focused_seconds"], 3),
            "interrupted_seconds": round(value["interrupted_seconds"], 3),
            "sessions": value["sessions"],
        }
        for key, value in sorted(buckets.items())
    ]
    return {"months": months, "points": points}


# --------------------------------------------------------------------------- #
# Categories and distributions
# --------------------------------------------------------------------------- #


def category_distribution(
    db: Session, user: User, tz_offset_minutes: int, days: int
) -> dict:
    start, end, _ = _day_window(tz_offset_minutes, days)
    sessions = _completed_in(db, user.id, start, end)

    groups: dict[int | None, dict] = {}
    for session in sessions:
        category = session.category
        key = category.id if category else None
        entry = groups.setdefault(
            key,
            {
                "category_id": key,
                "name": category.name if category else UNCATEGORIZED["name"],
                "color": category.color if category else UNCATEGORIZED["color"],
                "focused_seconds": 0.0,
                "sessions": 0,
            },
        )
        entry["focused_seconds"] += max(0.0, session.focused_duration or 0.0)
        entry["sessions"] += 1

    total = sum(entry["focused_seconds"] for entry in groups.values())
    slices = [
        {
            **entry,
            "focused_seconds": round(entry["focused_seconds"], 3),
            "share": round(entry["focused_seconds"] / total, 4) if total > 0 else 0.0,
        }
        for entry in sorted(
            groups.values(), key=lambda item: item["focused_seconds"], reverse=True
        )
        if entry["focused_seconds"] > 0
    ]
    return {"total_focused_seconds": round(total, 3), "slices": slices}


def duration_distribution(sessions: list[FocusSession]) -> dict:
    buckets = [
        {"label": "< 15m", "min": 0, "max": 900, "sessions": 0},
        {"label": "15-30m", "min": 900, "max": 1800, "sessions": 0},
        {"label": "30-60m", "min": 1800, "max": 3600, "sessions": 0},
        {"label": "1-2h", "min": 3600, "max": 7200, "sessions": 0},
        {"label": "2h+", "min": 7200, "max": None, "sessions": 0},
    ]
    durations = sorted(
        max(0.0, s.focused_duration or 0.0)
        for s in sessions
        if (s.focused_duration or 0.0) > 0
    )
    for duration in durations:
        for bucket in buckets:
            upper = bucket["max"]
            if upper is None or duration < upper:
                bucket["sessions"] += 1
                break

    if durations:
        middle = len(durations) // 2
        median = (
            durations[middle]
            if len(durations) % 2 == 1
            else (durations[middle - 1] + durations[middle]) / 2
        )
    else:
        median = 0.0

    return {
        "buckets": [{k: v for k, v in bucket.items() if k != "min"} for bucket in buckets],
        "average_seconds": round(sum(durations) / len(durations), 3) if durations else 0.0,
        "median_seconds": round(median, 3),
        "longest_seconds": round(durations[-1], 3) if durations else 0.0,
    }


TIME_BANDS = [
    ("Early morning", 0, 6),
    ("Morning", 6, 12),
    ("Afternoon", 12, 17),
    ("Evening", 17, 21),
    ("Night", 21, 24),
]


def time_of_day(sessions: list[FocusSession], tz_offset_minutes: int) -> dict:
    buckets = [
        {"label": label, "focused_seconds": 0.0, "sessions": 0}
        for label, _, _ in TIME_BANDS
    ]
    for session in sessions:
        hour = _to_local(session.started_at, tz_offset_minutes).hour
        for index, (_, start, end) in enumerate(TIME_BANDS):
            if start <= hour < end:
                buckets[index]["focused_seconds"] += max(
                    0.0, session.focused_duration or 0.0
                )
                buckets[index]["sessions"] += 1
                break
    for bucket in buckets:
        bucket["focused_seconds"] = round(bucket["focused_seconds"], 3)

    best = max(buckets, key=lambda item: item["focused_seconds"], default=None)
    if best is not None and best["focused_seconds"] <= 0:
        best = None
    return {
        "buckets": buckets,
        "best_window": best["label"] if best else None,
        "best_window_focused_seconds": best["focused_seconds"] if best else 0.0,
    }


# --------------------------------------------------------------------------- #
# Focus score and overview
# --------------------------------------------------------------------------- #


def focus_score(db: Session, user: User, tz_offset_minutes: int, days: int) -> dict:
    start, end, _ = _day_window(tz_offset_minutes, days)
    sessions = [
        s
        for s in _sessions_between(db, user.id, start, end)
        if s.status in (COMPLETED, CANCELLED)
    ]
    completed = [s for s in sessions if s.status == COMPLETED]
    cancelled = [s for s in sessions if s.status == CANCELLED]
    focused, interrupted = _sum_sessions(completed)
    return compute_focus_score(
        focused_seconds=focused,
        interrupted_seconds=interrupted,
        completed_sessions=len(completed),
        cancelled_sessions=len(cancelled),
        window_days=days,
    )


def _streak(db: Session, user: User, tz_offset_minutes: int) -> int:
    start, end, _ = _day_window(tz_offset_minutes, 120)
    sessions = _completed_in(db, user.id, start, end)
    active_days = {
        _to_local(s.started_at, tz_offset_minutes).date()
        for s in sessions
        if (s.focused_duration or 0.0) > 0
    }
    if not active_days:
        return 0

    today = _to_local(utcnow(), tz_offset_minutes).date()
    cursor = today if today in active_days else today - timedelta(days=1)
    streak = 0
    while cursor in active_days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def overview(db: Session, user: User, tz_offset_minutes: int) -> dict:
    today = _to_local(utcnow(), tz_offset_minutes).date()
    today_start = local_day_start(today, tz_offset_minutes)
    today_end = local_day_start(today + timedelta(days=1), tz_offset_minutes)

    today_sessions = _completed_in(db, user.id, today_start, today_end)
    today_focused, today_interrupted = _sum_sessions(today_sessions)

    week = daily_series(db, user, tz_offset_minutes, 7)
    week_points = week["points"]
    week_focused = sum(point["focused_seconds"] for point in week_points)

    # The seven days immediately before the current seven-day window.
    previous_start = local_day_start(today - timedelta(days=13), tz_offset_minutes)
    previous_end = local_day_start(today - timedelta(days=6), tz_offset_minutes)
    previous = _completed_in(db, user.id, previous_start, previous_end)
    prev_focused, _ = _sum_sessions(previous)
    change: float | None = None
    if prev_focused > 0:
        change = round((week_focused - prev_focused) / prev_focused * 100, 1)

    score = focus_score(db, user, tz_offset_minutes, DEFAULT_WINDOW_DAYS)
    categories = category_distribution(db, user, tz_offset_minutes, 7)

    recent = db.scalars(
        select(FocusSession)
        .options(
            joinedload(FocusSession.category), selectinload(FocusSession.interruptions)
        )
        .where(
            FocusSession.user_id == user.id,
            FocusSession.status.in_([COMPLETED, CANCELLED]),
        )
        .order_by(FocusSession.started_at.desc())
        .limit(5)
    ).unique().all()

    all_time_sessions = int(
        db.scalar(
            select(func.count(FocusSession.id)).where(
                FocusSession.user_id == user.id, FocusSession.status == COMPLETED
            )
        )
        or 0
    )
    all_time_focused = float(
        db.scalar(
            select(func.coalesce(func.sum(FocusSession.focused_duration), 0.0)).where(
                FocusSession.user_id == user.id, FocusSession.status == COMPLETED
            )
        )
        or 0.0
    )
    all_time_interruptions = int(
        db.scalar(
            select(func.count(Interruption.id))
            .join(FocusSession, Interruption.session_id == FocusSession.id)
            .where(
                FocusSession.user_id == user.id, FocusSession.status == COMPLETED
            )
        )
        or 0
    )
    demo_count = int(
        db.scalar(
            select(func.count(FocusSession.id)).where(
                FocusSession.user_id == user.id, FocusSession.is_demo == 1
            )
        )
        or 0
    )

    return {
        "generated_at": utcnow(),
        "today": today,
        "today_focused_seconds": today_focused,
        "today_interrupted_seconds": today_interrupted,
        "today_sessions": len(today_sessions),
        "today_average_session_seconds": round(
            today_focused / len(today_sessions), 3
        )
        if today_sessions
        else 0.0,
        "week_focused_seconds": round(week_focused, 3),
        "week_change_percent": change,
        "current_streak_days": _streak(db, user, tz_offset_minutes),
        "focus_score": score["score"],
        "focus_score_status": score["status"],
        "top_category": categories["slices"][0] if categories["slices"] else None,
        "weekly_trend": week_points,
        "recent_sessions": [serialize_session(item) for item in recent],
        "totals": {
            "focused_seconds": round(all_time_focused, 3),
            "sessions": float(all_time_sessions),
            "interruptions": float(all_time_interruptions),
            "demo_sessions": float(demo_count),
        },
    }


def insights(db: Session, user: User, tz_offset_minutes: int, days: int = 30) -> dict:
    start, end, _ = _day_window(tz_offset_minutes, days)
    sessions = _sessions_between(db, user.id, start, end)
    completed = [s for s in sessions if s.status == COMPLETED]

    active_days = {
        _to_local(s.started_at, tz_offset_minutes).date()
        for s in completed
        if (s.focused_duration or 0.0) > 0
    }
    consistency = round(len(active_days) / days * 100, 1) if days else 0.0

    by_day: dict[date, float] = defaultdict(float)
    for session in completed:
        by_day[_to_local(session.started_at, tz_offset_minutes).date()] += max(
            0.0, session.focused_duration or 0.0
        )
    best_day = None
    if by_day:
        best_date, best_seconds = max(by_day.items(), key=lambda item: item[1])
        best_day = {"date": best_date, "focused_seconds": round(best_seconds, 3)}

    reason_totals: dict[str, dict] = {}
    for session in completed:
        for interruption in session.interruptions:
            label = reason_label(interruption.reason, interruption.custom_reason)
            entry = reason_totals.setdefault(
                label, {"label": label, "count": 0, "seconds": 0.0}
            )
            entry["count"] += 1
            entry["seconds"] += max(0.0, interruption.duration or 0.0)

    focused_seconds, _ = _sum_sessions(completed)
    frequency = (
        round(
            sum(entry["count"] for entry in reason_totals.values())
            / (focused_seconds / 3600),
            2,
        )
        if focused_seconds > 0
        else 0.0
    )

    return {
        "consistency_days": len(active_days),
        "consistency_percent": consistency,
        "total_sessions": len(completed),
        "best_day": best_day,
        "interruption_frequency_per_hour": frequency,
        "interruption_reasons": sorted(
            reason_totals.values(), key=lambda item: item["seconds"], reverse=True
        ),
        "time_of_day": time_of_day(completed, tz_offset_minutes),
        "duration_distribution": duration_distribution(completed),
    }
