from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.database.session import get_db
from app.models import User
from app.schemas.common import Message
from app.schemas.session import (
    InterruptionCreate,
    SessionActionOut,
    SessionCreate,
    SessionListOut,
    SessionOut,
    SessionUpdate,
)
from app.services import session_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/active", response_model=SessionOut | None)
def read_active_session(
    db: Session = Depends(get_db), user: User = Depends(current_user)
):
    """Current open session, used for recovery after a refresh."""
    session = session_service.get_open_session(db, user)
    if session is None:
        return None
    from app.services.session_clock import serialize_session

    return serialize_session(session)


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return session_service.create_session(db, user, payload)


@router.get("", response_model=SessionListOut)
def list_sessions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    category_id: int | None = Query(default=None, alias="categoryId"),
    search: str | None = Query(default=None, max_length=120),
    date_from: datetime | None = Query(default=None, alias="dateFrom"),
    date_to: datetime | None = Query(default=None, alias="dateTo"),
    sort: str = Query(default="recent"),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    items, total = session_service.list_sessions(
        db,
        user,
        limit=limit,
        offset=offset,
        status_filter=status_filter,
        category_id=category_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{session_id}", response_model=SessionOut)
def read_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    from app.services.session_clock import serialize_session

    return serialize_session(session_service.load_session(db, user, session_id))


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return session_service.update_session(db, user, session_id, payload)


@router.post("/{session_id}/pause", response_model=SessionActionOut)
def pause_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return {
        "session": session_service.pause_session(db, user, session_id),
        "message": "Session paused.",
    }


@router.post("/{session_id}/resume", response_model=SessionActionOut)
def resume_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return {
        "session": session_service.resume_session(db, user, session_id),
        "message": "Session resumed.",
    }


@router.post("/{session_id}/complete", response_model=SessionActionOut)
def complete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return {
        "session": session_service.complete_session(db, user, session_id),
        "message": "Session completed.",
    }


@router.post("/{session_id}/cancel", response_model=SessionActionOut)
def cancel_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return {
        "session": session_service.cancel_session(db, user, session_id),
        "message": "Session cancelled.",
    }


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    session_service.delete_session(db, user, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{session_id}/interruptions",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_interruption(
    session_id: int,
    payload: InterruptionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return session_service.start_interruption(
        db,
        user,
        session_id,
        reason=payload.reason,
        custom_reason=payload.custom_reason,
        notes=payload.notes,
    )


@router.get("/{session_id}/interruptions", response_model=list[dict])
def list_interruptions(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    from app.services.session_clock import serialize_interruption

    session = session_service.load_session(db, user, session_id)
    return [serialize_interruption(item) for item in session.interruptions]
