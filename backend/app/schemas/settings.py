from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import APIModel


class SettingsOut(APIModel):
    theme: str
    accent_color: str
    default_target_duration: int
    notifications_enabled: bool
    sound_enabled: bool
    auto_idle_detection_enabled: bool
    idle_threshold_seconds: int
    updated_at: datetime


class SettingsUpdate(APIModel):
    theme: str | None = None
    accent_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    default_target_duration: int | None = Field(default=None, ge=60, le=8 * 3600)
    notifications_enabled: bool | None = None
    sound_enabled: bool | None = None
    auto_idle_detection_enabled: bool | None = None
    idle_threshold_seconds: int | None = Field(default=None, ge=15, le=900)

    @field_validator("theme")
    @classmethod
    def valid_theme(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in {"dark", "light", "system"}:
            raise ValueError("Theme must be one of: dark, light, system.")
        return value


class ProfileOut(APIModel):
    id: int
    username: str
    email: str | None = None
    created_at: datetime
    member_since_days: int
    total_sessions: int


class ProfileUpdate(APIModel):
    """Only the display name is editable.

    Email is the account identifier. Changing it without proving ownership
    would let one person claim another person's address, so it is deliberately
    read-only until a verification flow exists.
    """

    username: str = Field(min_length=1, max_length=80)

    @field_validator("username")
    @classmethod
    def strip_username(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Username cannot be empty.")
        return cleaned
