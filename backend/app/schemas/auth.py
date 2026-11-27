from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import APIModel


class RegisterIn(APIModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    username: str = Field(min_length=1, max_length=80)

    @field_validator("username")
    @classmethod
    def strip_username(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Display name cannot be empty.")
        return cleaned


class LoginIn(APIModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class GoogleIn(APIModel):
    id_token: str = Field(min_length=10, max_length=8192)


class RefreshIn(APIModel):
    refresh_token: str = Field(min_length=10, max_length=512)


class UserOut(APIModel):
    id: int
    username: str
    email: str | None = None
    email_verified: bool
    has_password: bool
    created_at: datetime


class SessionOut(APIModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: UserOut


class ChangePasswordIn(APIModel):
    current_password: str = Field(default="", max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class DeleteAccountIn(APIModel):
    password: str | None = Field(default=None, max_length=128)
    google_id_token: str | None = Field(default=None, max_length=8192)


class MessageOut(APIModel):
    message: str
