from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.database.session import get_db
from app.models import User
from app.schemas.session import SessionOut
from app.services import session_service

router = APIRouter(prefix="/interruptions", tags=["interruptions"])


@router.post("/{interruption_id}/end", response_model=SessionOut)
def end_interruption(
    interruption_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return session_service.end_interruption(db, user, interruption_id)


@router.delete("/{interruption_id}", response_model=SessionOut)
def delete_interruption(
    interruption_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return session_service.delete_interruption(db, user, interruption_id)
