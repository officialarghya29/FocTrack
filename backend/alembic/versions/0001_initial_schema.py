"""Initial FocTrack schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-26
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("color", sa.String(length=9), nullable=False),
        sa.Column("is_default", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])

    op.create_table(
        "focus_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("is_demo", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("target_duration", sa.Integer(), nullable=True),
        sa.Column(
            "accumulated_active_seconds", sa.Float(), nullable=False, server_default="0"
        ),
        sa.Column("paused_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("last_resumed_at", sa.DateTime(), nullable=True),
        sa.Column("paused_at", sa.DateTime(), nullable=True),
        sa.Column("focused_duration", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "interrupted_duration", sa.Float(), nullable=False, server_default="0"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_focus_sessions_user_id", "focus_sessions", ["user_id"])
    op.create_index("ix_focus_sessions_category_id", "focus_sessions", ["category_id"])
    op.create_index("ix_focus_sessions_started_at", "focus_sessions", ["started_at"])
    op.create_index("ix_focus_sessions_ended_at", "focus_sessions", ["ended_at"])

    # Belt and braces: the service layer checks for an open session, and this
    # partial unique index makes concurrent duplicates impossible.
    op.execute(
        "CREATE UNIQUE INDEX uq_open_session_per_user ON focus_sessions (user_id) "
        "WHERE status IN ('ACTIVE', 'PAUSED')"
    )

    op.create_table(
        "interruptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "session_id",
            sa.Integer(),
            sa.ForeignKey("focus_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("reason", sa.String(length=40), nullable=False),
        sa.Column("custom_reason", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_interruptions_session_id", "interruptions", ["session_id"])

    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("theme", sa.String(length=12), nullable=False, server_default="dark"),
        sa.Column(
            "accent_color", sa.String(length=9), nullable=False, server_default="#B7F36B"
        ),
        sa.Column(
            "default_target_duration",
            sa.Integer(),
            nullable=False,
            server_default="1500",
        ),
        sa.Column(
            "notifications_enabled", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("sound_enabled", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "auto_idle_detection_enabled",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "idle_threshold_seconds", sa.Integer(), nullable=False, server_default="120"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_open_session_per_user")
    op.drop_table("user_settings")
    op.drop_index("ix_interruptions_session_id", table_name="interruptions")
    op.drop_table("interruptions")
    op.drop_index("ix_focus_sessions_ended_at", table_name="focus_sessions")
    op.drop_index("ix_focus_sessions_started_at", table_name="focus_sessions")
    op.drop_index("ix_focus_sessions_category_id", table_name="focus_sessions")
    op.drop_index("ix_focus_sessions_user_id", table_name="focus_sessions")
    op.drop_table("focus_sessions")
    op.drop_index("ix_categories_user_id", table_name="categories")
    op.drop_table("categories")
    op.drop_table("users")
