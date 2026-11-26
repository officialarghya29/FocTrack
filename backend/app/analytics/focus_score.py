"""The FocTrack focus score.

    Focus ratio       = focused / (focused + interrupted)
    Consistency ratio = completed / started
    Score             = 100 * (0.80 * focus_ratio + 0.20 * consistency)

Rules baked into the implementation:

* Paused time is neither focused nor interrupted, so breaks never hurt the
  score.
* Cancelled sessions contribute nothing to the focus ratio (their partial
  durations are discarded) but they do count in the denominator of the
  consistency ratio.
* Interruption time is capped at the session's active time when it is
  recorded, so it cannot be double counted.
* Below three completed sessions or five minutes of activity the score is
  reported as insufficient data instead of a misleading number.

The score is an application-defined productivity indicator. It is not a
clinically validated measurement.
"""

from __future__ import annotations

from app.schemas.analytics import ScoreComponent

MIN_SESSIONS = 3
MIN_ACTIVITY_SECONDS = 300
WEIGHTS = {"focus_ratio": 0.80, "consistency_ratio": 0.20}
DEFAULT_WINDOW_DAYS = 7


def compute_focus_score(
    *,
    focused_seconds: float,
    interrupted_seconds: float,
    completed_sessions: int,
    cancelled_sessions: int,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> dict:
    started = completed_sessions + cancelled_sessions
    total = focused_seconds + interrupted_seconds

    focus_ratio = (focused_seconds / total) if total > 0 else 0.0
    consistency_ratio = (completed_sessions / started) if started > 0 else 0.0

    insufficient = (
        completed_sessions < MIN_SESSIONS or total < MIN_ACTIVITY_SECONDS
    )

    score: float | None
    if insufficient:
        score = None
    else:
        raw = 100 * (
            WEIGHTS["focus_ratio"] * focus_ratio
            + WEIGHTS["consistency_ratio"] * consistency_ratio
        )
        score = round(min(100.0, max(0.0, raw)), 1)

    components = [
        ScoreComponent(
            key="focus_ratio",
            label="Focus ratio",
            weight=WEIGHTS["focus_ratio"],
            value=round(focus_ratio, 4),
            contribution=round(100 * WEIGHTS["focus_ratio"] * focus_ratio, 1),
            explanation=(
                "Focused time divided by focused plus interrupted time in the window. "
                "Paused time is excluded entirely."
            ),
        ),
        ScoreComponent(
            key="consistency_ratio",
            label="Consistency",
            weight=WEIGHTS["consistency_ratio"],
            value=round(consistency_ratio, 4),
            contribution=round(100 * WEIGHTS["consistency_ratio"] * consistency_ratio, 1),
            explanation=(
                "Completed sessions divided by all sessions started in the window. "
                "Cancelled sessions count against consistency but not focus ratio."
            ),
        ),
    ]

    if insufficient:
        explanation = (
            f"Not enough data yet. The score unlocks after {MIN_SESSIONS} completed "
            f"sessions and at least {MIN_ACTIVITY_SECONDS // 60} minutes of tracked "
            "focus in the last "
            f"{window_days} days."
        )
    else:
        explanation = (
            f"80% focus ratio ({focus_ratio * 100:.1f}% focused) + 20% consistency "
            f"({completed_sessions}/{started} sessions completed). "
            "Paused time is excluded and interruptions are capped at active time."
        )

    return {
        "score": score,
        "status": "insufficient_data" if insufficient else "available",
        "window_days": window_days,
        "focused_seconds": round(focused_seconds, 3),
        "interrupted_seconds": round(interrupted_seconds, 3),
        "focus_ratio": round(focus_ratio, 4),
        "consistency_ratio": round(consistency_ratio, 4),
        "completed_sessions": completed_sessions,
        "cancelled_sessions": cancelled_sessions,
        "minimum_sessions": MIN_SESSIONS,
        "components": components,
        "explanation": explanation,
    }
