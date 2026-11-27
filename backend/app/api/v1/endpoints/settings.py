from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.database.session import get_db
from app.models import User
from app.schemas.settings import ProfileOut, ProfileUpdate, SettingsOut, SettingsUpdate
from app.services import profile_service, settings_service

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=SettingsOut)
def read_settings(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return settings_service.get_settings(db, user)


@router.patch("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return settings_service.update_settings(db, user, payload)


@router.get("/profile", response_model=ProfileOut)
def read_profile(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return profile_service.profile_summary(db, user)


@router.patch("/profile", response_model=ProfileOut)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    user.username = payload.username
    db.commit()
    db.refresh(user)
    return profile_service.profile_summary(db, user)
