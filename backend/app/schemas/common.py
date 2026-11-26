from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


class APIModel(BaseModel):
    """Base schema: snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Message(APIModel):
    detail: str


T = TypeVar("T")


class Page(APIModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
