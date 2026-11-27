"""Record the browser timezone offset on each focus session.

Revision ID: 0003_session_tz_offset
Revises: 0002_auth
Create Date: 2026-11-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_session_tz_offset"
down_revision = "0002_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "focus_sessions",
        sa.Column("tz_offset_minutes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("focus_sessions", "tz_offset_minutes")
