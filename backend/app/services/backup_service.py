from __future__ import annotations

import csv
import io

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.clock import utcnow
from app.models import Category, FocusSession, Interruption, User
from app.services.profile_service import profile_summary
from app.services.session_clock import serialize_session
from app.services.settings_service import get_settings


def export_all(db: Session, user: User) -> dict:
    categories = list(
        db.scalars(select(Category).where(Category.user_id == user.id)).all()
    )
    sessions = list(
        db.scalars(
            select(FocusSession)
            .options(
                joinedload(FocusSession.category),
                selectinload(FocusSession.interruptions),
            )
            .where(FocusSession.user_id == user.id)
            .order_by(FocusSession.started_at.asc())
        )
        .unique()
        .all()
    )
    settings = get_settings(db, user)
    return {
        "exportedAt": utcnow(),
        "format": "foctrack.export.v1",
        "profile": profile_summary(db, user),
        "settings": {
            "theme": settings.theme,
            "accentColor": settings.accent_color,
            "defaultTargetDuration": settings.default_target_duration,
            "notificationsEnabled": bool(settings.notifications_enabled),
            "soundEnabled": bool(settings.sound_enabled),
            "autoIdleDetectionEnabled": bool(settings.auto_idle_detection_enabled),
            "idleThresholdSeconds": settings.idle_threshold_seconds,
        },
        "categories": [
            {
                "id": category.id,
                "name": category.name,
                "color": category.color,
                "isDefault": bool(category.is_default),
                "createdAt": category.created_at,
            }
            for category in categories
        ],
        "sessions": [serialize_session(session) for session in sessions],
    }


CSV_COLUMNS = [
    "title",
    "category",
    "started_at",
    "ended_at",
    "focused_seconds",
    "interrupted_seconds",
    "paused_seconds",
    "status",
    "notes",
]


def export_sessions_csv(db: Session, user: User) -> str:
    """Return the same session data as the JSON export, flat and portable.

    The column names match the importer's aliases, so an export can be edited
    and re-imported without translation.
    """
    sessions = list(
        db.scalars(
            select(FocusSession)
            .options(joinedload(FocusSession.category))
            .where(FocusSession.user_id == user.id)
            .order_by(FocusSession.started_at.asc())
        )
        .unique()
        .all()
    )
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for session in sessions:
        writer.writerow(
            {
                "title": session.title,
                "category": session.category.name if session.category else "",
                "started_at": session.started_at.isoformat(),
                "ended_at": session.ended_at.isoformat() if session.ended_at else "",
                "focused_seconds": round(session.focused_duration, 3),
                "interrupted_seconds": round(session.interrupted_duration, 3),
                "paused_seconds": round(session.paused_seconds, 3),
                "status": session.status,
                "notes": session.notes or "",
            }
        )
    return buffer.getvalue()


def delete_all_sessions(db: Session, user: User) -> int:
    session_ids = list(
        db.scalars(select(FocusSession.id).where(FocusSession.user_id == user.id)).all()
    )
    if session_ids:
        db.execute(delete(Interruption).where(Interruption.session_id.in_(session_ids)))
        db.execute(delete(FocusSession).where(FocusSession.id.in_(session_ids)))
        db.commit()
    return len(session_ids)


def delete_everything(db: Session, user: User) -> None:
    """Remove all tracked data while keeping the account and categories."""
    delete_all_sessions(db, user)
