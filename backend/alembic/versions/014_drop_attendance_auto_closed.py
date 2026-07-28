"""Drop attendance_record.auto_closed — the auto-close-with-fabricated-time
approach was scrapped; a stale open session is now simply excluded from
"currently clocked in" checks (see attendance_repo.STALE_SESSION_HOURS)
rather than being closed out with an invented clock-out time.

Revision ID: 014_drop_attendance_auto_closed
Revises: 013_attendance_auto_close
Create Date: 2026-07-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "014_drop_attendance_auto_closed"
down_revision: Union[str, None] = "013_attendance_auto_close"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("attendance_record", "auto_closed")


def downgrade() -> None:
    op.add_column("attendance_record", sa.Column("auto_closed", sa.Boolean, nullable=False, server_default=sa.false()))
