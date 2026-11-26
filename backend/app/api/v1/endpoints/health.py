from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.clock import utcnow
from app.core.config import settings
from app.database.session import SessionLocal

router = APIRouter(tags=["health"])


@router.get("/health", response_model=None)
def health() -> dict | JSONResponse:
    database = "ok"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover - only hit when the DB is down
        database = "unavailable"
    payload = {
        "status": "ok" if database == "ok" else "degraded",
        "service": settings.app_name,
        "version": settings.version,
        "environment": settings.environment,
        "database": database,
        "time": utcnow().isoformat(),
    }
    # A degraded database must fail the platform health check, not report 200.
    if database != "ok":
        return JSONResponse(status_code=503, content=payload)
    return payload
