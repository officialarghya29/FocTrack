from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import User
from app.schemas.settings import SettingsUpdate
from app.services.profile_service import ensure_settings


def get_settings(db: Session, user: User):
    return ensure_settings(db, user)


def update_settings(db: Session, user: User, payload: SettingsUpdate):
    settings = ensure_settings(db, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings
