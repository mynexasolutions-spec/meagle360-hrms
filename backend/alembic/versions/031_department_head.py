"""Add head_id (department head) to department.

Revision ID: 031_department_head
Revises: 030_ats_distribution
Create Date: 2026-11-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "031_department_head"
down_revision = "030_ats_distribution"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "department",
        sa.Column("head_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_department_head_id_employee",
        "department",
        "employee",
        ["head_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_department_head_id_employee", "department", type_="foreignkey")
    op.drop_column("department", "head_id")
