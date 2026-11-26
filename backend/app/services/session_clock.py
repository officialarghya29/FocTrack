"""Timestamp arithmetic for focus sessions.

The single source of truth is the wall clock. Nothing in the system counts
ticks: every duration is derived from UTC timestamps, which makes the timer
immune to tab throttling, laptop sleep and page refreshes.

Glossary
--------
wall time        now - started_at
active time      time the session was running (pauses removed)
interrupted time time inside an interruption while the session was running
focused time     active time - interrupted time (never below zero)
paused time      time spent in the PAUSED state
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.clock import ensure_utc, seconds_between, utcnow
from app.models import FocusSession, Interruption, SessionStatus

INTERRUPTION_REASONS: dict[str, str] = {
    "phone": "Phone",
    "social_media": "Social media",
    "notifications": "Notifications",
    "conversation": "Conversation",
    "browsing": "Browsing",
    "fatigue": "Fatigue",
    "other": "Other",
}


def reason_label(reason: str, custom_reason: str | None) -> str:
    if reason == "other" and custom_reason:
        return custom_reason
    return INTERRUPTION_REASONS.get(reason, reason.replace("_", " ").title())


@dataclass
class SessionMetrics:
    focused_seconds: float = 0.0
    interrupted_seconds: float = 0.0
    paused_seconds: float = 0.0
    active_seconds: float = 0.0
    elapsed_seconds: float = 0.0
    interruptions: list[dict] = field(default_factory=list)


def _interruption_span(
    interruption: Interruption, reference: object, session_end: object
) -> tuple[float, bool]:
    """Duration of an interruption, clipped to the session's lifetime."""
    start = ensure_utc(interruption.started_at)
    end = ensure_utc(interruption.ended_at)
    if end is None:
        end = ensure_utc(reference)
    if end is None:
        return 0.0, True
    reference_end = ensure_utc(session_end)
    if reference_end is not None and end > reference_end:
        end = reference_end
    if end < start:
        return 0.0, interruption.ended_at is None
    return (end - start).total_seconds(), interruption.ended_at is None


def compute_metrics(
    session: FocusSession,
    interruptions: list[Interruption] | None = None,
    now=None,
) -> SessionMetrics:
    """Derive every duration for a session, live or closed."""
    now = ensure_utc(now) or utcnow()
    status = SessionStatus(session.status)
    started = ensure_utc(session.started_at)
    closed_at = ensure_utc(session.ended_at)

    # Point in time the session's clocks stop advancing.
    if closed_at is not None:
        reference = closed_at
    else:
        reference = now

    active = float(session.accumulated_active_seconds or 0.0)
    if status is SessionStatus.ACTIVE and session.last_resumed_at is not None:
        active += seconds_between(session.last_resumed_at, reference)

    paused = float(session.paused_seconds or 0.0)
    if status is SessionStatus.PAUSED and session.paused_at is not None:
        paused += seconds_between(session.paused_at, reference)

    if status in (SessionStatus.COMPLETED, SessionStatus.CANCELLED):
        # Frozen totals written at completion/cancellation time.
        focused = float(session.focused_duration or 0.0)
        interrupted = float(session.interrupted_duration or 0.0)
    else:
        raw = session.interruptions if interruptions is None else interruptions
        interrupted = 0.0
        for item in raw:
            duration, _ = _interruption_span(item, reference, None)
            if status is SessionStatus.PAUSED:
                # An interruption can never extend past a pause boundary.
                cap = seconds_between(item.started_at, session.paused_at)
                duration = min(duration, max(0.0, cap))
            interrupted += duration
        interrupted = min(interrupted, active)
        focused = max(0.0, active - interrupted)

    elapsed = seconds_between(started, reference)
    return SessionMetrics(
        focused_seconds=round(max(0.0, focused), 3),
        interrupted_seconds=round(max(0.0, interrupted), 3),
        paused_seconds=round(max(0.0, paused), 3),
        active_seconds=round(max(0.0, focused + interrupted), 3),
        elapsed_seconds=round(elapsed, 3),
    )


def serialize_interruption(
    interruption: Interruption, reference=None
) -> dict:
    reference = ensure_utc(reference) or utcnow()
    duration, is_open = _interruption_span(interruption, reference, None)
    return {
        "id": interruption.id,
        "session_id": interruption.session_id,
        "reason": interruption.reason,
        "custom_reason": interruption.custom_reason,
        "label": reason_label(interruption.reason, interruption.custom_reason),
        "notes": interruption.notes,
        "started_at": interruption.started_at,
        "ended_at": interruption.ended_at,
        "duration_seconds": round(duration, 3),
        "is_open": is_open,
    }


def serialize_session(session: FocusSession, now=None) -> dict:
    now = ensure_utc(now) or utcnow()
    metrics = compute_metrics(session, now=now)
    interruptions = [
        serialize_interruption(item, reference=now) for item in session.interruptions
    ]
    return {
        "id": session.id,
        "title": session.title,
        "notes": session.notes,
        "status": session.status,
        "category": session.category,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "target_duration": session.target_duration,
        "focused_seconds": metrics.focused_seconds,
        "interrupted_seconds": metrics.interrupted_seconds,
        "paused_seconds": metrics.paused_seconds,
        "elapsed_seconds": metrics.elapsed_seconds,
        "interruption_count": len(interruptions),
        "interruptions": interruptions,
        "is_demo": bool(session.is_demo),
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }
