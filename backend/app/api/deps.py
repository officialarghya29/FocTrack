from __future__ import annotations

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models import User
from app.services.profile_service import get_profile


def current_user(db: Session = Depends(get_db)) -> User:
    """Resolve the local profile for this database.

    FocTrack MVP is single-profile. Routes still scope every query by user id,
    so an authentication dependency can replace this without touching services.
    """
    return get_profile(db)


def tz_offset(
    tz_offset_minutes: int = Query(
        default=0,
        ge=-840,
        le=840,
        alias="tzOffsetMinutes",
        description="Browser timezone offset (Date.getTimezoneOffset()) in minutes.",
    )
) -> int:
    return tz_offset_minutes
