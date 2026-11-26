"""Session lifecycle: create, pause, resume, complete, cancel, delete."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.clock import ensure_utc, seconds_between, utcnow
from app.core.errors import bad_request, conflict, not_found
from app.models import Category, FocusSession, Interruption, SessionStatus, User
from app.schemas.session import SessionCreate, SessionUpdate
from app.services.session_clock import (
    INTERRUPTION_REASONS,
    compute_metrics,
    serialize_session,
)


def load_session(db: Session, user: User, session_id: int) -> FocusSession:
    stmt = (
        select(FocusSession)
        .options(
            joinedload(FocusSession.category),
            selectinload(FocusSession.interruptions),
        )
        .where(FocusSession.id == session_id, FocusSession.user_id == user.id)
    )
    session = db.scalar(stmt)
    if session is None:
        raise not_found("Session not found.")
    return session


def get_open_session(db: Session, user: User) -> FocusSession | None:
    stmt = (
        select(FocusSession)
        .options(
            joinedload(FocusSession.category),
            selectinload(FocusSession.interruptions),
        )
        .where(
            FocusSession.user_id == user.id,
            FocusSession.status.in_([s.value for s in SessionStatus.open_states()]),
        )
        .order_by(FocusSession.started_at.desc())
    )
    return db.scalar(stmt)


def _resolve_category(db: Session, user: User, category_id: int | None) -> Category | None:
    if category_id is None:
        return None
    category = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if category is None:
        raise not_found("Category not found.")
    return category


def _close_open_interruptions(session: FocusSession, at: datetime) -> None:
    """An open interruption ends when the session pauses or closes."""
    for interruption in session.interruptions:
        if interruption.ended_at is None:
            interruption.ended_at = at
            interruption.duration = round(
                seconds_between(interruption.started_at, at), 3
            )


def _accumulate_active(session: FocusSession, at: datetime) -> None:
    if session.status == SessionStatus.ACTIVE.value and session.last_resumed_at:
        session.accumulated_active_seconds = round(
            (session.accumulated_active_seconds or 0.0)
            + seconds_between(session.last_resumed_at, at),
            3,
        )
    session.last_resumed_at = None


def _accumulate_paused(session: FocusSession, at: datetime) -> None:
    if session.status == SessionStatus.PAUSED.value and session.paused_at is not None:
        session.paused_seconds = round(
            (session.paused_seconds or 0.0) + seconds_between(session.paused_at, at), 3
        )
    session.paused_at = None


def _finalize(db: Session, session: FocusSession, status: SessionStatus, at: datetime) -> None:
    _close_open_interruptions(session, at)
    _accumulate_active(session, at)
    _accumulate_paused(session, at)
    # Metrics are computed while the session is still open so the live clock
    # logic (not the frozen snapshot) produces the final numbers.
    metrics = compute_metrics(session, now=at)
    session.focused_duration = metrics.focused_seconds
    session.interrupted_duration = metrics.interrupted_seconds
    session.ended_at = at
    session.status = status.value
    session.updated_at = at
    db.commit()
    db.refresh(session)


def create_session(db: Session, user: User, payload: SessionCreate) -> dict:
    category = _resolve_category(db, user, payload.category_id)
    existing = get_open_session(db, user)
    if existing is not None:
        raise conflict(
            "A focus session is already running. Finish or cancel it before starting a new one."
        )

    now = utcnow()
    session = FocusSession(
        user_id=user.id,
        category_id=category.id if category else None,
        title=payload.title.strip(),
        notes=payload.notes,
        status=SessionStatus.ACTIVE.value,
        started_at=now,
        target_duration=payload.target_duration,
        last_resumed_at=now,
    )
    session.category = category
    db.add(session)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise conflict(
            "A focus session is already running. Finish or cancel it before starting a new one."
        ) from None
    db.refresh(session)
    return serialize_session(session)


def update_session(
    db: Session, user: User, session_id: int, payload: SessionUpdate
) -> dict:
    session = load_session(db, user, session_id)
    data = payload.model_dump(exclude_unset=True)

    if "category_id" in data:
        category = _resolve_category(db, user, data["category_id"])
        session.category = category
        session.category_id = category.id if category else None
    if "title" in data and data["title"] is not None:
        session.title = data["title"].strip()
    if "notes" in data:
        session.notes = data["notes"]
    if "target_duration" in data:
        session.target_duration = data["target_duration"]

    session.updated_at = utcnow()
    db.commit()
    db.refresh(session)
    return serialize_session(session)


def pause_session(db: Session, user: User, session_id: int) -> dict:
    session = load_session(db, user, session_id)
    if session.status != SessionStatus.ACTIVE.value:
        raise conflict(f"Cannot pause a session that is {session.status.lower()}.")

    now = utcnow()
    _close_open_interruptions(session, now)
    _accumulate_active(session, now)
    session.paused_at = now
    session.status = SessionStatus.PAUSED.value
    session.updated_at = now
    db.commit()
    db.refresh(session)
    db.expire(session, ["interruptions"])
    return serialize_session(session)


def resume_session(db: Session, user: User, session_id: int) -> dict:
    session = load_session(db, user, session_id)
    if session.status != SessionStatus.PAUSED.value:
        raise conflict(f"Cannot resume a session that is {session.status.lower()}.")

    now = utcnow()
    _accumulate_paused(session, now)
    session.last_resumed_at = now
    session.status = SessionStatus.ACTIVE.value
    session.updated_at = now
    db.commit()
    db.refresh(session)
    return serialize_session(session)


def complete_session(db: Session, user: User, session_id: int) -> dict:
    session = load_session(db, user, session_id)
    if not SessionStatus(session.status).is_open:
        raise conflict(f"Cannot complete a session that is {session.status.lower()}.")

    now = utcnow()
    metrics = compute_metrics(session, now=now)
    if metrics.focused_seconds + metrics.interrupted_seconds < 1:
        raise conflict(
            "This session has no recorded activity yet. Cancel it instead of completing it."
        )
    _finalize(db, session, SessionStatus.COMPLETED, now)
    return serialize_session(session)


def cancel_session(db: Session, user: User, session_id: int) -> dict:
    session = load_session(db, user, session_id)
    if not SessionStatus(session.status).is_open:
        raise conflict(f"Cannot cancel a session that is {session.status.lower()}.")
    _finalize(db, session, SessionStatus.CANCELLED, utcnow())
    return serialize_session(session)


def delete_session(db: Session, user: User, session_id: int) -> None:
    session = load_session(db, user, session_id)
    db.delete(session)
    db.commit()


def start_interruption(
    db: Session,
    user: User,
    session_id: int,
    reason: str,
    custom_reason: str | None,
    notes: str | None,
) -> tuple[dict, dict]:
    session = load_session(db, user, session_id)
    if session.status != SessionStatus.ACTIVE.value:
        raise conflict("Interruptions can only be recorded while a session is running.")

    normalized = reason.strip().lower().replace(" ", "_")
    if normalized not in INTERRUPTION_REASONS:
        if normalized == "other" or not normalized:
            normalized = "other"
        else:
            raise bad_request(
                "Unknown interruption reason. Use one of: "
                + ", ".join(INTERRUPTION_REASONS)
                + "."
            )
    if normalized == "other" and not (custom_reason or "").strip():
        raise bad_request("A custom reason is required when the reason is 'Other'.")

    now = utcnow()
    _close_open_interruptions(session, now)
    interruption = Interruption(
        session_id=session.id,
        reason=normalized,
        custom_reason=(custom_reason or "").strip() or None,
        notes=notes,
        started_at=now,
    )
    db.add(interruption)
    session.updated_at = now
    db.commit()
    db.refresh(session)
    db.refresh(interruption)
    db.expire(session, ["interruptions"])
    return serialize_session(session)


def end_interruption(
    db: Session, user: User, interruption_id: int
) -> dict:
    stmt = (
        select(Interruption)
        .join(FocusSession, Interruption.session_id == FocusSession.id)
        .options(selectinload(Interruption.session).selectinload(FocusSession.interruptions))
        .where(Interruption.id == interruption_id, FocusSession.user_id == user.id)
    )
    interruption = db.scalar(stmt)
    if interruption is None:
        raise not_found("Interruption not found.")
    if interruption.ended_at is not None:
        raise conflict("This interruption has already ended.")

    now = utcnow()
    interruption.ended_at = now
    interruption.duration = round(seconds_between(interruption.started_at, now), 3)
    db.commit()
    session = load_session(db, user, interruption.session_id)
    return serialize_session(session)


def delete_interruption(db: Session, user: User, interruption_id: int) -> dict:
    stmt = (
        select(Interruption)
        .join(FocusSession, Interruption.session_id == FocusSession.id)
        .where(Interruption.id == interruption_id, FocusSession.user_id == user.id)
    )
    interruption = db.scalar(stmt)
    if interruption is None:
        raise not_found("Interruption not found.")
    session_id = interruption.session_id
    db.delete(interruption)
    db.flush()

    session = load_session(db, user, session_id)
    if not SessionStatus(session.status).is_open:
        # Closed sessions keep frozen totals. Removing an interruption must
        # return that time to focused time instead of leaving the record
        # internally inconsistent.
        active = float(session.accumulated_active_seconds or 0.0)
        interrupted = min(
            active,
            float(
                db.scalar(
                    select(func.coalesce(func.sum(Interruption.duration), 0.0)).where(
                        Interruption.session_id == session_id
                    )
                )
                or 0.0
            ),
        )
        session.interrupted_duration = round(interrupted, 3)
        session.focused_duration = round(max(0.0, active - interrupted), 3)
        session.updated_at = utcnow()
    db.commit()
    db.refresh(session)
    db.expire(session, ["interruptions"])
    return serialize_session(session)


def list_sessions(
    db: Session,
    user: User,
    *,
    limit: int = 20,
    offset: int = 0,
    status_filter: str | None = None,
    category_id: int | None = None,
    search: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: str = "recent",
) -> tuple[list[dict], int]:
    conditions = [FocusSession.user_id == user.id]
    if status_filter:
        if status_filter not in {s.value for s in SessionStatus}:
            raise bad_request("Invalid status filter.")
        conditions.append(FocusSession.status == status_filter)
    if category_id is not None:
        conditions.append(FocusSession.category_id == category_id)
    if search and search.strip():
        # Treat user input literally: % and _ are search characters, not wildcards.
        term = (
            search.strip()
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        conditions.append(FocusSession.title.ilike(f"%{term}%", escape="\\"))
    if date_from is not None:
        conditions.append(FocusSession.started_at >= ensure_utc(date_from))
    if date_to is not None:
        conditions.append(FocusSession.started_at < ensure_utc(date_to))

    order = {
        "recent": FocusSession.started_at.desc(),
        "oldest": FocusSession.started_at.asc(),
        "duration": FocusSession.focused_duration.desc(),
        "longest": FocusSession.focused_duration.desc(),
    }.get(sort)
    if order is None:
        raise bad_request("Invalid sort option.")

    base = select(FocusSession).where(*conditions)
    total = int(db.scalar(select(func.count(FocusSession.id)).where(*conditions)) or 0)
    stmt = (
        base.options(
            joinedload(FocusSession.category),
            selectinload(FocusSession.interruptions),
        )
        .order_by(order, FocusSession.id.desc())
        .limit(limit)
        .offset(offset)
    )
    sessions = db.scalars(stmt).unique().all()
    return [serialize_session(item) for item in sessions], total
