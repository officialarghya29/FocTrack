from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.clock import utcnow
from app.database.base import Base
from app.database.types import UTCDateTime


class SessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

    @classmethod
    def open_states(cls) -> tuple["SessionStatus", ...]:
        return (cls.ACTIVE, cls.PAUSED)

    @property
    def is_open(self) -> bool:
        return self in (SessionStatus.ACTIVE, SessionStatus.PAUSED)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    settings: Mapped["UserSettings | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    categories: Mapped[list["Category"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    sessions: Mapped[list["FocusSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#B7F36B")
    is_default: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="categories")
    sessions: Mapped[list["FocusSession"]] = relationship(back_populates="category")


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    is_demo: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)

    started_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)

    target_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Running clock bookkeeping for open sessions.
    accumulated_active_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    paused_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_resumed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    # Frozen totals written when a session closes. These are the values the
    # analytics layer trusts for finished sessions.
    focused_duration: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    interrupted_duration: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="sessions")
    category: Mapped[Category | None] = relationship(back_populates="sessions")
    interruptions: Mapped[list["Interruption"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="Interruption.started_at",
    )


class Interruption(Base):
    __tablename__ = "interruptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("focus_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    custom_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)

    session: Mapped[FocusSession] = relationship(back_populates="interruptions")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    theme: Mapped[str] = mapped_column(String(12), nullable=False, default="dark")
    accent_color: Mapped[str] = mapped_column(String(9), nullable=False, default="#B7F36B")
    default_target_duration: Mapped[int] = mapped_column(Integer, nullable=False, default=1500)
    notifications_enabled: Mapped[bool] = mapped_column(Integer, nullable=False, default=0)
    sound_enabled: Mapped[bool] = mapped_column(Integer, nullable=False, default=1)
    auto_idle_detection_enabled: Mapped[bool] = mapped_column(
        Integer, nullable=False, default=0
    )
    idle_threshold_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="settings")
