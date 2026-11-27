"""FocTrack API entrypoint."""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.security import AuthError
from app.database.init_db import init_database

logger = logging.getLogger("foctrack")

MAX_BODY_BYTES = 3 * 1024 * 1024

DESCRIPTION = """
FocTrack measures focused time, interrupted time and consistency across focus
sessions. The backend is the single source of truth for every stored session
and every analytics number.

* Timestamps are stored in UTC and returned as ISO-8601.
* Analytics accept `tzOffsetMinutes` (JavaScript `getTimezoneOffset()`) so day
  boundaries match the user's local calendar.
* Every account is private. Requests authenticate with a short-lived bearer
  token; a stolen database cannot be replayed as a sign-in.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
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
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id

        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body is too large."},
                headers={"X-Request-ID": request_id},
            )

        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            # The exception handlers below turn this into JSON; log it with the
            # request id so a report can be matched to a server line.
            logger.exception(
                "Unhandled error request_id=%s %s %s", request_id, request.method, request.url.path
            )
            raise
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        logger.info(
            "%s %s -> %s in %sms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "name": settings.app_name,
            "version": settings.version,
            "docs": "/docs",
            "health": f"{settings.api_v1_prefix}/health",
        }

    @app.exception_handler(AuthError)
    async def auth_handler(request: Request, exc: AuthError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=headers,
        )

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
