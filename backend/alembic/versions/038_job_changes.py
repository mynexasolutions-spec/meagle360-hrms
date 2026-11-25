"""Designation levels and employee job history (new nullable column and new table).

Revision ID: 038_job_changes
Revises: 037_employee_document_files
Create Date: 2026-11-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "038_job_changes"
down_revision = "037_employee_document_files"
branch_labels = None
depends_on = None

TABLE = "employee_job_change"


def _fk(name, target, ondelete="CASCADE", nullable=False):
    return sa.Column(name, UUID(as_uuid=True), sa.ForeignKey(target, ondelete=ondelete), nullable=nullable)


def _ts(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.add_column("designation", sa.Column("level", sa.Integer, nullable=True))
    op.create_table(
        TABLE,
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        _fk("company_id", "company.id"), _fk("employee_id", "employee.id"),
        sa.Column("change_type", sa.String(20), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("from_designation", sa.String(150)),
        sa.Column("to_designation", sa.String(150)),
        sa.Column("from_department", sa.String(255)),
        sa.Column("to_department", sa.String(255)),
        sa.Column("from_manager", sa.String(255)),
        sa.Column("to_manager", sa.String(255)),
        sa.Column("salary_revised", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("reason", sa.String(500), nullable=False, server_default=""),
        _fk("actor_employee_id", "employee.id", "SET NULL", True),
        _ts("created_at"), _ts("updated_at"),
        sa.CheckConstraint(
            "change_type IN ('assigned', 'promotion', 'demotion', 'role_change', 'transfer', 'manager_change')",
            name="ck_employee_job_change_type"),
    )
    op.create_index(f"ix_{TABLE}_company_id", TABLE, ["company_id"])
    op.create_index(f"ix_{TABLE}_employee_id", TABLE, ["employee_id"])
    # Reasons are private: only reachable through the API, never Supabase's public REST endpoint.
    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table(TABLE)
    op.drop_column("designation", "level")
