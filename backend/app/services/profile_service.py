"""Single local profile.

FocTrack's MVP runs in explicit local-profile mode: one profile per database,
no passwords, no pretend multi-tenancy. Every row is still keyed by `user_id`
and every query filters on it, so enabling real accounts later only requires
replacing this module's bootstrap function with an auth dependency.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import Category, FocusSession, User, UserSettings

DEFAULT_PROFILE_NAME = "Focus User"

DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("Studying", "#B7F36B"),
    ("Programming", "#62DCEB"),
    ("Research", "#A78BFA"),
    ("Reading", "#F3B65D"),
    ("Writing", "#7FD1A6"),
    ("Work", "#F07878"),
    ("Personal", "#E8A0C8"),
    ("Other", "#9BA7B1"),
]


def get_profile(db: Session) -> User:
    """Return the local profile, creating it (and defaults) on first run."""
    user = db.scalar(select(User).order_by(User.id).limit(1))
    if user is not None:
        return user

    user = User(username=DEFAULT_PROFILE_NAME)
    db.add(user)
    db.flush()

    db.add(UserSettings(user_id=user.id))
    for name, color in DEFAULT_CATEGORIES:
        db.add(Category(user_id=user.id, name=name, color=color, is_default=True))
    db.commit()
    db.refresh(user)
    return user


def ensure_settings(db: Session, user: User) -> UserSettings:
    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    if settings is None:
        settings = UserSettings(user_id=user.id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def profile_summary(db: Session, user: User) -> dict:
    total = db.scalar(
        select(func.count(FocusSession.id)).where(
            FocusSession.user_id == user.id,
            FocusSession.status == "COMPLETED",
        )
    )
    created = user.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    days = max(0, (utcnow() - created).days)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "created_at": created,
        "member_since_days": days,
        "total_sessions": int(total or 0),
    }


def current_timestamp() -> datetime:
    return utcnow()
