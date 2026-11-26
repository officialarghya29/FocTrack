from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.core.clock import utcnow
from app.core.config import settings
from app.database.session import SessionLocal

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    database = "ok"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover - only hit when the DB is down
        database = "unavailable"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "service": settings.app_name,
        "version": settings.version,
        "environment": settings.environment,
        "database": database,
        "time": utcnow().isoformat(),
    }
