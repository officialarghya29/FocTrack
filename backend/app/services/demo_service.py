"""Demo data mode.

Demo sessions are real database rows flagged `is_demo`, produced by a seeded
random generator so the numbers are reproducible. They are always labelled in
the UI and can be removed in one action.
"""

from __future__ import annotations

import random
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import Category, FocusSession, Interruption, SessionStatus, User
from app.services.session_clock import INTERRUPTION_REASONS

TITLES = [
    "Algorithms revision",
    "Rewrite auth middleware",
    "Database indexing deep dive",
    "Thesis literature review",
    "Design system refactor",
    "Client proposal draft",
    "Data structures practice",
    "API documentation pass",
    "Reading: Deep Work",
    "Statistics problem set",
    "Sprint planning notes",
    "Portfolio case study",
    "Type-safe state machines",
    "Research paper outline",
    "SQL query optimisation",
    "UI accessibility audit",
]

REASON_KEYS = ["phone", "social_media", "notifications", "conversation", "browsing", "fatigue"]


def _create_session(
    db: Session,
    user: User,
    *,
    category: Category,
    title: str,
    start,
    focus_minutes: int,
    pause_minutes: int,
    interruptions: list[tuple[str, int]],
    completed: bool,
) -> None:
    focused = focus_minutes * 60
    interrupted = sum(seconds for _, seconds in interruptions)
    session_start = start
    # Walk the clock forward through interruptions, pauses and focus blocks.
    cursor = session_start
    session = FocusSession(
        user_id=user.id,
        category_id=category.id,
        title=title,
        status=SessionStatus.COMPLETED.value if completed else SessionStatus.CANCELLED.value,
        started_at=session_start,
        is_demo=1,
        accumulated_active_seconds=float(focused + interrupted + pause_minutes * 60),
        paused_seconds=float(pause_minutes * 60),
        focused_duration=float(focused),
        interrupted_duration=float(interrupted),
    )

    for index, (reason, seconds) in enumerate(interruptions):
        started_at = cursor + timedelta(seconds=600 + index * 420)
        ended_at = started_at + timedelta(seconds=seconds)
        session.interruptions.append(
            Interruption(
                reason=reason,
                custom_reason=None,
                notes=None,
                started_at=started_at,
                ended_at=ended_at,
                duration=float(seconds),
            )
        )
        cursor = ended_at

    ended_at = session_start + timedelta(
        seconds=focused + interrupted + pause_minutes * 60
    )
    session.ended_at = ended_at
    db.add(session)


def seed_demo_data(db: Session, user: User) -> int:
    existing = db.scalar(
        select(FocusSession.id).where(
            FocusSession.user_id == user.id, FocusSession.is_demo == 1
        )
    )
    if existing is not None:
        return 0

    categories = list(
        db.scalars(select(Category).where(Category.user_id == user.id)).all()
    )
    if not categories:
        return 0

    rng = random.Random(20261126)
    now = utcnow()
    today_local = now.replace(minute=0, second=0, microsecond=0)
    created = 0

    for day_offset in range(0, 21):
        if day_offset > 0 and rng.random() < 0.18:
            continue  # a rest day keeps the chart honest
        sessions_today = rng.randint(1, 4) if day_offset else 2
        for slot in range(sessions_today):
            completed = rng.random() > 0.12
            focus_minutes = rng.randint(18, 78)
            pause_minutes = rng.choice([0, 0, 5, 10])
            interruption_count = rng.choices([0, 1, 2, 3], weights=[45, 33, 16, 6])[0]
            interruptions = [
                (rng.choice(REASON_KEYS), rng.randint(45, 260))
                for _ in range(interruption_count)
            ]
            start = (
                today_local
                - timedelta(days=day_offset)
                + timedelta(hours=8 + slot * 3, minutes=rng.choice([0, 15, 30, 45]))
            )
            if start >= now:
                start = now - timedelta(minutes=focus_minutes + 10)
            category = rng.choice(categories)
            _create_session(
                db,
                user,
                category=category,
                title=rng.choice(TITLES),
                start=start,
                focus_minutes=focus_minutes,
                pause_minutes=pause_minutes,
                interruptions=interruptions,
                completed=completed,
            )
            created += 1

    db.commit()
    return created


def clear_demo_data(db: Session, user: User) -> int:
    session_ids = list(
        db.scalars(
            select(FocusSession.id).where(
                FocusSession.user_id == user.id, FocusSession.is_demo == 1
            )
        ).all()
    )
    if not session_ids:
        return 0
    db.execute(delete(Interruption).where(Interruption.session_id.in_(session_ids)))
    db.execute(delete(FocusSession).where(FocusSession.id.in_(session_ids)))
    db.commit()
    return len(session_ids)
