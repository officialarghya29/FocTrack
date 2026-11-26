from __future__ import annotations

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
    """Remove all tracked data while keeping the local profile and categories."""
    delete_all_sessions(db, user)
