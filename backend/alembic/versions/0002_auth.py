"""Real accounts: credentials, Google links and refresh sessions.

Revision ID: 0002_auth
Revises: 0001_initial
Create Date: 2026-11-27
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_auth"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))
    op.add_column(
        "users",
        sa.Column("email_verified", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(), nullable=True))
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )

    # Case-insensitive uniqueness: addresses are stored lowercased, and the
    # functional index keeps providers that hand back mixed case honest.
    # PostgreSQL and SQLite both support expression indexes.
    op.create_index(
        "uq_users_email_lower",
        "users",
        [sa.text("lower(email)")],
        unique=True,
    )
    op.create_index("uq_users_google_sub", "users", ["google_sub"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("uq_users_google_sub", table_name="users")
    op.drop_index("uq_users_email_lower", table_name="users")
    op.drop_column("users", "token_version")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "email_verified")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "password_hash")
