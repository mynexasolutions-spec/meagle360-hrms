"""Platform layer — Nexa Solutions super-admin + tenant lifecycle

Revision ID: 002_platform
Revises: 001_phase1
Create Date: 2026-07-17

Adds:
- platform_admin table (Nexa Solutions staff, no company_id — platform-level)
- company.status / plan_tier / seat_limit (tenant lifecycle + plan)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "002_platform"
down_revision: Union[str, None] = "001_phase1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── PLATFORM_ADMIN ───────────────────────────────────
    op.create_table(
        "platform_admin",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("is_super_admin", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── COMPANY: lifecycle + plan columns ────────────────
    op.add_column(
        "company",
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
    )
    op.add_column(
        "company",
        sa.Column("plan_tier", sa.String(50), nullable=False, server_default="standard"),
    )
    op.add_column(
        "company",
        sa.Column("seat_limit", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("company", "seat_limit")
    op.drop_column("company", "plan_tier")
    op.drop_column("company", "status")
    op.drop_table("platform_admin")
