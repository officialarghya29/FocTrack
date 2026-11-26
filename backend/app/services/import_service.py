"""CSV session import.

The importer accepts a flat session table: one row per completed or cancelled
session, with either explicit durations or a start/end pair. It never creates
open sessions, never fabricates analytics and never silently drops a malformed
row — every rejected row is reported with its line number.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from dateutil import parser as date_parser
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import bad_request
from app.models import Category, FocusSession, SessionStatus, User

MAX_ROWS = 5000
MAX_ERRORS = 50
MAX_TITLE = 160
MAX_CATEGORY = 60

REQUIRED_COLUMNS = {"title", "started_at"}

COLUMN_ALIASES = {
    "title": "title",
    "task": "title",
    "session": "title",
    "name": "title",
    "category": "category",
    "category_name": "category",
    "started_at": "started_at",
    "start": "started_at",
    "start_time": "started_at",
    "started": "started_at",
    "ended_at": "ended_at",
    "end": "ended_at",
    "end_time": "ended_at",
    "ended": "ended_at",
    "focused_minutes": "focused_minutes",
    "focus_minutes": "focused_minutes",
    "focused": "focused_minutes",
    "interrupted_minutes": "interrupted_minutes",
    "interruption_minutes": "interrupted_minutes",
    "interrupted": "interrupted_minutes",
    "focused_seconds": "focused_seconds",
    "focus_seconds": "focused_seconds",
    "interrupted_seconds": "interrupted_seconds",
    "paused_minutes": "paused_minutes",
    "paused_seconds": "paused_seconds",
    "status": "status",
    "notes": "notes",
    "note": "notes",
}

TEMPLATE_HEADER = (
    "title,category,started_at,ended_at,focused_minutes,interrupted_minutes,status,notes"
)

CATEGORY_PALETTE = ["#B7F36B", "#62DCEB", "#A78BFA", "#F3B65D", "#7FD1A6", "#F07878", "#E8A0C8"]


def template_csv() -> str:
    return "\n".join(
        [
            TEMPLATE_HEADER,
            "Read a paper,Research,2026-11-24T09:00:00Z,2026-11-24T09:50:00Z,45,5,COMPLETED,"
            "Two phone checks logged",
            "Refactor importer,Programming,2026-11-25T14:30:00Z,2026-11-25T15:15:00Z,,,COMPLETED,",
        ]
    )


def _normalise_header(value: str) -> str:
    cleaned = value.strip().lower().replace(" ", "_").replace("-", "_")
    return COLUMN_ALIASES.get(cleaned, cleaned)


def _parse_datetime(value: str) -> datetime:
    raw = value.strip()
    if not raw:
        raise ValueError("started_at is empty.")
    candidate = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        try:
            parsed = date_parser.parse(raw)
        except (ValueError, OverflowError) as exc:
            raise ValueError(f"could not parse timestamp '{raw}'.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_seconds(value: str | None, column: str) -> float | None:
    if value is None or not value.strip():
        return None
    try:
        number = float(value.strip())
    except ValueError as exc:
        raise ValueError(f"{column} must be a number.") from exc
    if number < 0:
        raise ValueError(f"{column} cannot be negative.")
    if number > 24 * 3600:
        raise ValueError(f"{column} exceeds 24 hours.")
    return number


def _minutes_to_seconds(value: str | None, column: str) -> float | None:
    parsed = _parse_seconds(value, column)
    return None if parsed is None else parsed * 60


def _get_or_create_category(
    db: Session, user: User, name: str, cache: dict[str, Category]
) -> tuple[Category, bool]:
    key = name.strip().lower()
    if key in cache:
        return cache[key], False
    existing = db.scalar(
        select(Category).where(
            Category.user_id == user.id, func.lower(Category.name) == key
        )
    )
    if existing is not None:
        cache[key] = existing
        return existing, False

    created = Category(
        user_id=user.id,
        name=name.strip(),
        color=CATEGORY_PALETTE[len(cache) % len(CATEGORY_PALETTE)],
        is_default=False,
    )
    db.add(created)
    db.flush()
    cache[key] = created
    return created, True


def import_sessions_csv(db: Session, user: User, content: bytes) -> dict:
    if len(content) > 2 * 1024 * 1024:
        raise bad_request("CSV files are limited to 2 MB.")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise bad_request("The file must be UTF-8 encoded CSV.") from None

    reader = csv.reader(io.StringIO(text))
    try:
        raw_header = next(reader)
    except StopIteration:
        raise bad_request("The CSV file is empty.") from None

    header = [_normalise_header(cell) for cell in raw_header]
    missing = REQUIRED_COLUMNS - set(header)
    if missing:
        raise bad_request(
            "Missing required column(s): " + ", ".join(sorted(missing)) + "."
        )
    if len(set(header)) != len(header):
        raise bad_request("The CSV header contains duplicate columns.")

    index = {name: position for position, name in enumerate(header)}
    imported = 0
    skipped = 0
    duplicates = 0
    categories_created = 0
    errors: list[dict] = []
    category_cache: dict[str, Category] = {}
    seen_keys: set[tuple[str, datetime]] = set()
    data_rows = 0

    def cell(values: list[str], name: str) -> str | None:
        position = index.get(name)
        if position is None or position >= len(values):
            return None
        return values[position]

    try:
        rows = list(reader)
    except csv.Error as exc:
        raise bad_request(f"Malformed CSV: {exc}.") from None

    for line_number, values in enumerate(rows, start=2):
        if not any(value.strip() for value in values):
            continue
        data_rows += 1
        if data_rows > MAX_ROWS:
            skipped += 1
            if len(errors) < MAX_ERRORS:
                errors.append({"row": line_number, "message": "Row limit of 5000 exceeded."})
            continue

        try:
            title = (cell(values, "title") or "").strip()
            if not title:
                raise ValueError("title is required.")
            if len(title) > MAX_TITLE:
                raise ValueError(f"title exceeds {MAX_TITLE} characters.")

            started_at = _parse_datetime(cell(values, "started_at") or "")

            status_raw = (cell(values, "status") or "COMPLETED").strip().upper()
            if status_raw not in {SessionStatus.COMPLETED.value, SessionStatus.CANCELLED.value}:
                raise ValueError("status must be COMPLETED or CANCELLED.")

            focused = _parse_seconds(cell(values, "focused_seconds"), "focused_seconds")
            if focused is None:
                focused = _minutes_to_seconds(
                    cell(values, "focused_minutes"), "focused_minutes"
                )
            interrupted = _parse_seconds(cell(values, "interrupted_seconds"), "interrupted_seconds")
            if interrupted is None:
                interrupted = _minutes_to_seconds(
                    cell(values, "interrupted_minutes"), "interrupted_minutes"
                )
            paused = _parse_seconds(cell(values, "paused_seconds"), "paused_seconds")
            if paused is None:
                paused = _minutes_to_seconds(
                    cell(values, "paused_minutes"), "paused_minutes"
                )
            interrupted = interrupted or 0.0
            paused = paused or 0.0

            ended_raw = (cell(values, "ended_at") or "").strip()
            if ended_raw:
                ended_at = _parse_datetime(ended_raw)
                wall = (ended_at - started_at).total_seconds()
                if wall < 0:
                    raise ValueError("ended_at is before started_at.")
            else:
                wall = (focused or 0.0) + interrupted + paused
                ended_at = started_at + timedelta(seconds=wall)

            if focused is None:
                # No focused column: infer it from the wall clock. Explicit
                # zeros are respected instead of being turned into full focus.
                focused = max(0.0, wall - interrupted - paused)
            if interrupted > wall:
                raise ValueError("interrupted duration exceeds the session length.")
            if focused + interrupted > wall + 1:
                raise ValueError("focused + interrupted exceeds the session length.")

            notes = (cell(values, "notes") or "").strip() or None
            if notes is not None and len(notes) > 1000:
                raise ValueError("notes exceed 1000 characters.")

            dedupe_key = (title.lower(), started_at)
            if dedupe_key in seen_keys:
                duplicates += 1
                skipped += 1
                if len(errors) < MAX_ERRORS:
                    errors.append(
                        {
                            "row": line_number,
                            "message": "Duplicate of an earlier row in this file.",
                        }
                    )
                continue
            seen_keys.add(dedupe_key)

            category_id = None
            category_name = (cell(values, "category") or "").strip()
            if category_name:
                if len(category_name) > MAX_CATEGORY:
                    raise ValueError(f"category exceeds {MAX_CATEGORY} characters.")
                category, created = _get_or_create_category(
                    db, user, category_name, category_cache
                )
                category_id = category.id
                if created:
                    categories_created += 1

            db.add(
                FocusSession(
                    user_id=user.id,
                    category_id=category_id,
                    title=title,
                    notes=notes,
                    status=status_raw,
                    started_at=started_at,
                    ended_at=ended_at,
                    accumulated_active_seconds=float(focused + interrupted),
                    paused_seconds=float(paused),
                    focused_duration=float(focused),
                    interrupted_duration=float(interrupted),
                    is_demo=0,
                )
            )
            imported += 1
        except ValueError as exc:
            skipped += 1
            if len(errors) < MAX_ERRORS:
                errors.append({"row": line_number, "message": str(exc)})

    if imported == 0 and skipped == 0:
        raise bad_request("The CSV file contains a header but no data rows.")

    db.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "categories_created": categories_created,
        "duplicate_titles": duplicates,
        "errors": errors,
    }
