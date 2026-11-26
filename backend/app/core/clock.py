"""Time utilities.

Every timestamp that leaves or enters the application boundary is UTC and
timezone aware. Only presentation layers convert to a local timezone.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone


def utcnow() -> datetime:
    """Current UTC time, truncated to microseconds (SQLite precision)."""
    return datetime.now(tz=timezone.utc).replace(tzinfo=timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def seconds_between(start: datetime | None, end: datetime | None) -> float:
    """Non-negative elapsed seconds between two timestamps."""
    if start is None or end is None:
        return 0.0
    return max(0.0, (ensure_utc(end) - ensure_utc(start)).total_seconds())


def local_now(tz_offset_minutes: int) -> datetime:
    """Wall clock time for a UTC offset, expressed as a UTC-coded timestamp.

    `tz_offset_minutes` follows the JavaScript convention of
    `Date.prototype.getTimezoneOffset()` (minutes to add to local time to get
    UTC), so India (+05:30) passes -330.
    """
    return utcnow() + timedelta(minutes=-tz_offset_minutes)


def local_day_start(day: date, tz_offset_minutes: int) -> datetime:
    """Convert a local calendar day into a UTC instant (inclusive)."""
    local_midnight = datetime(
        day.year, day.month, day.day, tzinfo=timezone.utc
    )
    return local_midnight + timedelta(minutes=tz_offset_minutes)


def local_range_start(days_back: int, tz_offset_minutes: int) -> datetime:
    """UTC instant for the start of the local day `days_back` days ago."""
    current_local = local_now(tz_offset_minutes)
    first_day = current_local.date() - timedelta(days=days_back - 1)
    return local_day_start(first_day, tz_offset_minutes)
