"""Attendance regularization, overtime, audit log

Revision ID: 004_workflows
Revises: 003_announcements
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

revision: str = "004_workflows"
down_revision: Union[str, None] = "003_announcements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "attendance_regularization",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("record_date", sa.Date(), nullable=False),
        sa.Column("requested_clock_in", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requested_clock_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by_employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_attendance_regularization_company_id", "attendance_regularization", ["company_id"])

    op.create_table(
        "overtime_request",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_date", sa.Date(), nullable=False),
        sa.Column("hours", sa.Numeric(4, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by_employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_overtime_request_company_id", "overtime_request", ["company_id"])

    op.create_table(
        "audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=True),
        sa.Column("details", JSON, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_log_company_id", "audit_log", ["company_id"])


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("overtime_request")
    op.drop_table("attendance_regularization")
