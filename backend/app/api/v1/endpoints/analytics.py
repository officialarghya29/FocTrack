from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.analytics.focus_score import DEFAULT_WINDOW_DAYS
from app.api.deps import current_user, tz_offset
from app.core.config import settings
from app.database.session import get_db
from app.models import User
from app.schemas.analytics import (
    CategoriesOut,
    DailyOut,
    FocusScoreOut,
    InsightsOut,
    MonthlyOut,
    OverviewOut,
    WeeklyOut,
)
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])

MAX_DAYS = settings.analytics_max_days


@router.get("/overview", response_model=OverviewOut)
def read_overview(
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    offset: int = Depends(tz_offset),
):
    return analytics_service.overview(db, user, offset)


@router.get("/daily", response_model=DailyOut)
def read_daily(
    days: int = Query(default=7, ge=1, le=MAX_DAYS),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    offset: int = Depends(tz_offset),
):
    return analytics_service.daily_series(db, user, offset, days)


@router.get("/weekly", response_model=WeeklyOut)
def read_weekly(
    weeks: int = Query(default=8, ge=1, le=52),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    offset: int = Depends(tz_offset),
):
    return analytics_service.weekly_series(db, user, offset, weeks)


@router.get("/monthly", response_model=MonthlyOut)
def read_monthly(
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    offset: int = Depends(tz_offset),
):
    return analytics_service.monthly_series(db, user, offset, months)


@router.get("/categories", response_model=CategoriesOut)
def read_categories(
    days: int = Query(default=30, ge=1, le=MAX_DAYS),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    offset: int = Depends(tz_offset),
):
    return analytics_service.category_distribution(db, user, offset, days)


@router.get("/focus-score", response_model=FocusScoreOut)
def read_focus_score(
    days: int = Query(default=DEFAULT_WINDOW_DAYS, ge=1, le=MAX_DAYS),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    offset: int = Depends(tz_offset),
):
    return analytics_service.focus_score(db, user, offset, days)


@router.get("/insights", response_model=InsightsOut)
def read_insights(
    days: int = Query(default=30, ge=7, le=MAX_DAYS),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
    offset: int = Depends(tz_offset),
):
    return analytics_service.insights(db, user, offset, days)
