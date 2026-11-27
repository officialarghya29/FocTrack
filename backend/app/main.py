"""FocTrack API entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.router import api_router
from app.core.config import settings
from app.database.init_db import init_database
from app.database.session import SessionLocal
from app.services.profile_service import get_profile

logger = logging.getLogger("foctrack")

DESCRIPTION = """
FocTrack measures focused time, interrupted time and consistency across focus
sessions. The backend is the single source of truth for every stored session
and every analytics number.

* Timestamps are stored in UTC and returned as ISO-8601.
* Analytics accept `tzOffsetMinutes` (JavaScript `getTimezoneOffset()`) so day
  boundaries match the user's local calendar.
* The MVP runs in explicit local-profile mode: one profile per database.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    with SessionLocal() as db:
        get_profile(db)
    logger.info("FocTrack API ready")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=DESCRIPTION,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "name": settings.app_name,
            "version": settings.version,
            "docs": "/docs",
            "health": f"{settings.api_v1_prefix}/health",
        }

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        errors = exc.errors()
        first = errors[0] if errors else {}
        field = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        message = first.get("msg", "Invalid request.")
        detail = f"{field}: {message}" if field else message
        # Pydantic error contexts can contain non-JSON values; flatten them.
        simplified = [
            {
                "loc": [str(part) for part in error.get("loc", [])],
                "msg": str(error.get("msg", "Invalid value.")),
                "type": str(error.get("type", "value_error")),
            }
            for error in errors
        ]
        return JSONResponse(
            status_code=422,
            content={"detail": detail, "errors": simplified},
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_handler(request: Request, exc: SQLAlchemyError):
        logger.exception("Database error")
        return JSONResponse(
            status_code=503,
            content={"detail": "The database is unavailable. Please try again."},
        )

    @app.exception_handler(Exception)
    async def unexpected_handler(request: Request, exc: Exception):
        # Every failure the client sees is JSON with a readable message, so the
        # interface can show the reason instead of parsing a bare 500.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Unexpected server error. Please try again."},
        )

    return app


app = create_app()
