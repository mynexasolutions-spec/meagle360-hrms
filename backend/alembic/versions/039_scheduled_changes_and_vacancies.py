"""Scheduled job changes and vacant positions (new tables only).

Revision ID: 039_scheduled_and_vacancies
Revises: 038_job_changes
Create Date: 2026-11-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "039_scheduled_and_vacancies"
down_revision = "038_job_changes"
branch_labels = None
depends_on = None


def _fk(name, target, ondelete="CASCADE", nullable=False):
    return sa.Column(name, UUID(as_uuid=True), sa.ForeignKey(target, ondelete=ondelete), nullable=nullable)


def _ts(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "scheduled_job_change",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        _fk("company_id", "company.id"), _fk("employee_id", "employee.id"),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("error", sa.String(500), nullable=False, server_default=""),
        _fk("created_by_employee_id", "employee.id", "SET NULL", True),
        _ts("created_at"), _ts("updated_at"),
        sa.CheckConstraint(
            "status IN ('pending', 'applied', 'cancelled', 'failed')", name="ck_scheduled_job_change_status"),
    )
    op.create_index("ix_scheduled_job_change_company_id", "scheduled_job_change", ["company_id"])
    op.create_index("ix_scheduled_job_change_employee_id", "scheduled_job_change", ["employee_id"])
    op.create_index(
        "uq_scheduled_job_change_pending", "scheduled_job_change", ["employee_id"], unique=True,
        postgresql_where=sa.text("status = 'pending'"))
    op.create_table(
        "vacant_position",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        _fk("company_id", "company.id"),
        sa.Column("title", sa.String(150), nullable=False),
        _fk("department_id", "department.id", "SET NULL", True),
        _fk("manager_id", "employee.id", "SET NULL", True),
        _fk("job_id", "job_openings.id", "SET NULL", True),
        _ts("created_at"), _ts("updated_at"),
    )
    op.create_index("ix_vacant_position_company_id", "vacant_position", ["company_id"])
    # Payloads hold salaries: only reachable through the API, never Supabase's public REST endpoint.
    op.execute("ALTER TABLE scheduled_job_change ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE vacant_position ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("vacant_position")
    op.drop_table("scheduled_job_change")
