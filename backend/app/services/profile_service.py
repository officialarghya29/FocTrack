"""Profile reads and account defaults.

Every row is keyed by `user_id` and every query filters on it. Accounts are
created through `auth_service.create_user_with_defaults`; this module only
reads profile summaries and owns the default category list.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models import FocusSession, User, UserSettings

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
