"""Track monthly leave accrual per leave type so accrual can be safely
run more than once without double-crediting employees for the same
month.

Revision ID: 012_leave_accrual_tracking
Revises: 011_payroll_statutory_engine
Create Date: 2026-07-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "012_leave_accrual_tracking"
down_revision: Union[str, None] = "011_payroll_statutory_engine"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("leave_type", sa.Column("last_accrued_period", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("leave_type", "last_accrued_period")
