"""Make the monthly attendance-regularization request cap admin-configurable
per company instead of a hardcoded constant.

Revision ID: 015_regularization_monthly_limit
Revises: 014_drop_attendance_auto_closed
Create Date: 2026-08-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "015_regularization_monthly_limit"
down_revision: Union[str, None] = "014_drop_attendance_auto_closed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("company", sa.Column("max_monthly_regularizations", sa.Integer, nullable=False, server_default="5"))


def downgrade() -> None:
    op.drop_column("company", "max_monthly_regularizations")
