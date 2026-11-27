from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    auth,
    categories,
    data,
    health,
    imports,
    interruptions,
    sessions,
    settings,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(sessions.router)
api_router.include_router(interruptions.router)
api_router.include_router(categories.router)
api_router.include_router(analytics.router)
api_router.include_router(settings.router)
api_router.include_router(data.router)
api_router.include_router(imports.router)
