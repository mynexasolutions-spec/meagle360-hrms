"""Track attendance records that were auto-closed by the overnight
stale-session job, so employees/admins can tell a system-generated
clock-out from a real one and review it.

Revision ID: 013_attendance_auto_close
Revises: 012_leave_accrual_tracking
Create Date: 2026-07-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "013_attendance_auto_close"
down_revision: Union[str, None] = "012_leave_accrual_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attendance_record", sa.Column("auto_closed", sa.Boolean, nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("attendance_record", "auto_closed")
