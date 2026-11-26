from __future__ import annotations

from app.schemas.common import APIModel


class ImportRowError(APIModel):
    row: int
    message: str


class ImportSummary(APIModel):
    imported: int
    skipped: int
    categories_created: int
    duplicate_titles: int
    errors: list[ImportRowError]
