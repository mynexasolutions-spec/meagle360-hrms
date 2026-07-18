"""Phase 1 — initial schema

Revision ID: 001_phase1
Revises: None
Create Date: 2026-07-15

Creates all 14 Phase 1 tables matching the ER diagram.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision: str = "001_phase1"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. COMPANY ───────────────────────────────────────
    op.create_table(
        "company",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("multi_entity", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── 2. DEPARTMENT ────────────────────────────────────
    op.create_table(
        "department",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("parent_department_id", UUID(as_uuid=True), sa.ForeignKey("department.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_department_company_id", "department", ["company_id"])

    # ── 3. EMPLOYEE ──────────────────────────────────────
    op.create_table(
        "employee",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("department.id", ondelete="SET NULL"), nullable=True),
        sa.Column("manager_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("employee_code", sa.String(50), nullable=False, unique=True),
        sa.Column("date_of_hire", sa.Date(), nullable=False),
        sa.Column("employment_status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_employee_company_id", "employee", ["company_id"])

    # ── 4. ROLE ──────────────────────────────────────────
    op.create_table(
        "role",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("permissions", JSON, default={}),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_role_company_id", "role", ["company_id"])

    # ── 5. USER_ACCOUNT ──────────────────────────────────
    op.create_table(
        "user_account",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("role.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("mfa_enabled", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_user_account_company_id", "user_account", ["company_id"])

    # ── 6. SHIFT ─────────────────────────────────────────
    op.create_table(
        "shift",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_type", sa.String(50), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_shift_company_id", "shift", ["company_id"])

    # ── 7. EMPLOYEE_SHIFT ────────────────────────────────
    op.create_table(
        "employee_shift",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_id", UUID(as_uuid=True), sa.ForeignKey("shift.id", ondelete="CASCADE"), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_employee_shift_company_id", "employee_shift", ["company_id"])

    # ── 8. EMPLOYEE_DOCUMENT ─────────────────────────────
    op.create_table(
        "employee_document",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doc_type", sa.String(100), nullable=False),
        sa.Column("file_url", sa.String(500), nullable=False),
        sa.Column("e_signed", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_employee_document_company_id", "employee_document", ["company_id"])

    # ── 9. ATTENDANCE_RECORD ─────────────────────────────
    op.create_table(
        "attendance_record",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("clock_in", sa.DateTime(timezone=True), nullable=False),
        sa.Column("clock_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="web"),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_attendance_record_company_id", "attendance_record", ["company_id"])
    op.create_index("ix_attendance_record_employee_id", "attendance_record", ["employee_id"])

    # ── 10. HOLIDAY_CALENDAR ─────────────────────────────
    op.create_table(
        "holiday_calendar",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_holiday_calendar_company_id", "holiday_calendar", ["company_id"])

    # ── 11. LEAVE_TYPE ───────────────────────────────────
    op.create_table(
        "leave_type",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("accrual_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_leave_type_company_id", "leave_type", ["company_id"])

    # ── 12. LEAVE_BALANCE ────────────────────────────────
    op.create_table(
        "leave_balance",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("leave_type_id", UUID(as_uuid=True), sa.ForeignKey("leave_type.id", ondelete="CASCADE"), nullable=False),
        sa.Column("balance", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_leave_balance_company_id", "leave_balance", ["company_id"])

    # ── 13. LEAVE_REQUEST ────────────────────────────────
    op.create_table(
        "leave_request",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("leave_type_id", UUID(as_uuid=True), sa.ForeignKey("leave_type.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_leave_request_company_id", "leave_request", ["company_id"])


def downgrade() -> None:
    op.drop_table("leave_request")
    op.drop_table("leave_balance")
    op.drop_table("leave_type")
    op.drop_table("holiday_calendar")
    op.drop_table("attendance_record")
    op.drop_table("employee_document")
    op.drop_table("employee_shift")
    op.drop_table("shift")
    op.drop_table("user_account")
    op.drop_table("role")
    op.drop_table("employee")
    op.drop_table("department")
    op.drop_table("company")
