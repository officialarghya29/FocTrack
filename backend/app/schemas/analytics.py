from __future__ import annotations

from datetime import date, datetime

from app.schemas.common import APIModel
from app.schemas.session import SessionOut


class TrendPoint(APIModel):
    label: str
    date: date
    focused_seconds: float
    interrupted_seconds: float
    sessions: int
    focus_score: float | None = None


class WeekPoint(APIModel):
    week_start: date
    label: str
    focused_seconds: float
    interrupted_seconds: float
    sessions: int


class MonthPoint(APIModel):
    month: str
    label: str
    focused_seconds: float
    interrupted_seconds: float
    sessions: int


class TotalsOut(APIModel):
    focused_seconds: float
    sessions: float
    interruptions: float
    demo_sessions: float


class BestDayOut(APIModel):
    date: date
    focused_seconds: float


class CategorySlice(APIModel):
    category_id: int | None
    name: str
    color: str
    focused_seconds: float
    sessions: int
    share: float


class ScoreComponent(APIModel):
    key: str
    label: str
    weight: float
    value: float
    contribution: float
    explanation: str


class FocusScoreOut(APIModel):
    score: float | None
    status: str
    window_days: int
    focused_seconds: float
    interrupted_seconds: float
    focus_ratio: float
    consistency_ratio: float
    completed_sessions: int
    cancelled_sessions: int
    minimum_sessions: int
    components: list[ScoreComponent]
    explanation: str


class OverviewOut(APIModel):
    generated_at: datetime
    today: date
    today_focused_seconds: float
    today_interrupted_seconds: float
    today_sessions: int
    today_average_session_seconds: float
    week_focused_seconds: float
    week_change_percent: float | None
    current_streak_days: int
    focus_score: float | None
    focus_score_status: str
    top_category: CategorySlice | None
    weekly_trend: list[TrendPoint]
    recent_sessions: list[SessionOut]
    totals: TotalsOut


class DailyOut(APIModel):
    days: int
    start: date
    end: date
    points: list[TrendPoint]


class WeeklyOut(APIModel):
    weeks: int
    points: list[WeekPoint]


class MonthlyOut(APIModel):
    months: int
    points: list[MonthPoint]


class CategoriesOut(APIModel):
    total_focused_seconds: float
    slices: list[CategorySlice]


class DistributionOut(APIModel):
    buckets: list[dict]
    average_seconds: float
    median_seconds: float
    longest_seconds: float


class TimeOfDayOut(APIModel):
    buckets: list[dict]
    best_window: str | None
    best_window_focused_seconds: float


class InsightsOut(APIModel):
    consistency_days: int
    consistency_percent: float
    total_sessions: int
    best_day: BestDayOut | None
    interruption_frequency_per_hour: float
    interruption_reasons: list[dict]
    time_of_day: TimeOfDayOut
    duration_distribution: DistributionOut
