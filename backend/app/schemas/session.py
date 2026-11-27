from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.category import CategoryOut
from app.schemas.common import APIModel


class InterruptionOut(APIModel):
    id: int
    session_id: int
    reason: str
    custom_reason: str | None = None
    label: str
    notes: str | None = None
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: float
    is_open: bool


class InterruptionCreate(APIModel):
    reason: str = Field(min_length=1, max_length=40)
    custom_reason: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class SessionOut(APIModel):
    id: int
    title: str
    notes: str | None = None
    status: str
    category: CategoryOut | None = None
    started_at: datetime
    ended_at: datetime | None = None
    target_duration: int | None = None
    focused_seconds: float
    interrupted_seconds: float
    paused_seconds: float
    elapsed_seconds: float
    interruption_count: int
    interruptions: list[InterruptionOut] = []
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime


class SessionCreate(APIModel):
    title: str = Field(min_length=1, max_length=160)
    category_id: int | None = None
    target_duration: int | None = Field(default=None, ge=60, le=8 * 3600)
    notes: str | None = Field(default=None, max_length=1000)
    # Date.getTimezoneOffset() from the browser, stored with the session so a
    # daylight-saving change cannot move historical sessions to another day.
    tz_offset_minutes: int | None = Field(default=None, ge=-840, le=840)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Session title cannot be empty.")
        return cleaned


class SessionUpdate(APIModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    category_id: int | None = None
    notes: str | None = Field(default=None, max_length=1000)
    target_duration: int | None = Field(default=None, ge=60, le=8 * 3600)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Session title cannot be empty.")
        return cleaned


class SessionListOut(APIModel):
    items: list[SessionOut]
    total: int
    limit: int
    offset: int


class SessionActionOut(APIModel):
    session: SessionOut
    message: str
