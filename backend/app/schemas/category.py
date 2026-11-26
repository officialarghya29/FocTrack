from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import APIModel

HEX_COLOR = r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"


class CategoryOut(APIModel):
    id: int
    name: str
    color: str
    is_default: bool
    created_at: datetime


class CategoryCreate(APIModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = Field(default="#B7F36B", pattern=HEX_COLOR)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Category name cannot be empty.")
        return cleaned


class CategoryUpdate(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: str | None = Field(default=None, pattern=HEX_COLOR)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Category name cannot be empty.")
        return cleaned
