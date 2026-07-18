"""Add Payroll Management

Creates salary_component, salary_structure, salary_structure_component,
employee_salary_assignment, payroll_run, payslip, payslip_line tables.
Adds Company.weekly_off_days (for LOP calculation) and LeaveType.is_paid
(admin-configurable paid vs unpaid leave types).

Backfills for existing companies:
- weekly_off_days defaults to [5, 6] (Sat/Sun, Python weekday() convention)
- a new "Payroll Manager" role (payroll:read/write/approve, employees:read),
  so Admin can grant payroll access to someone else without touching their
  primary role
- Admin's existing role gets payroll:read/write/approve added
- standard India-default salary components (editable/disable-able by Admin)
- a "Loss of Pay" leave type (is_paid=False) so there's an unpaid leave
  option ready to use immediately

Revision ID: 010_payroll_management
Revises: 009_sites_employee_profile
Create Date: 2026-07-19
"""

import json
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "010_payroll_management"
down_revision: Union[str, None] = "009_sites_employee_profile"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PAYROLL_MANAGER_PERMISSIONS = {
    "employees:read": True,
    "payroll:read": True, "payroll:write": True, "payroll:approve": True,
}

ADMIN_EXTRA_PERMISSIONS = {
    "payroll:read": True, "payroll:write": True, "payroll:approve": True,
}

# (name, component_type, calculation_type, value, is_statutory, is_taxable, display_order)
DEFAULT_INDIA_COMPONENTS = [
    ("HRA", "earning", "percent_of_basic", 40.0, False, True, 10),
    ("Conveyance Allowance", "earning", "fixed", 1600.0, False, False, 20),
    ("Special Allowance", "earning", "fixed", 0.0, False, True, 30),
    ("EPF (Employee Provident Fund)", "deduction", "percent_of_basic", 12.0, True, False, 10),
    ("ESI (Employee State Insurance)", "deduction", "percent_of_gross", 0.75, True, False, 20),
    ("Professional Tax", "deduction", "fixed", 200.0, True, False, 30),
    ("TDS (Income Tax)", "deduction", "fixed", 0.0, True, False, 40),
]


def upgrade() -> None:
    op.add_column(
        "company",
        sa.Column("weekly_off_days", postgresql.JSON, nullable=True),
    )
    op.execute("UPDATE company SET weekly_off_days = '[5, 6]'::json")
    op.alter_column("company", "weekly_off_days", nullable=False)

    op.add_column(
        "leave_type",
        sa.Column("is_paid", sa.Boolean, nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "salary_component",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("component_type", sa.String(20), nullable=False),
        sa.Column("calculation_type", sa.String(30), nullable=False),
        sa.Column("value", sa.Numeric(12, 4), nullable=False),
        sa.Column("is_statutory", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_taxable", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "salary_structure",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "salary_structure_component",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("salary_structure_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("salary_structure.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("salary_component_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("salary_component.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("salary_structure_id", "salary_component_id", name="uq_structure_component"),
    )

    op.create_table(
        "employee_salary_assignment",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("salary_structure_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("salary_structure.id", ondelete="SET NULL"), nullable=True),
        sa.Column("basic_pay", sa.Numeric(12, 2), nullable=False),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "payroll_run",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finalized_by_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "year", "month", name="uq_payroll_run_company_month"),
    )

    op.create_table(
        "payslip",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("payroll_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payroll_run.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("basic_pay", sa.Numeric(12, 2), nullable=False),
        sa.Column("gross_earnings", sa.Numeric(12, 2), nullable=False),
        sa.Column("gross_deductions", sa.Numeric(12, 2), nullable=False),
        sa.Column("working_days", sa.Numeric(5, 2), nullable=False),
        sa.Column("lop_days", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("lop_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("net_pay", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("payroll_run_id", "employee_id", name="uq_payslip_run_employee"),
    )

    op.create_table(
        "payslip_line",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("payslip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payslip.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("component_name", sa.String(150), nullable=False),
        sa.Column("component_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_manual_adjustment", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    conn = op.get_bind()
    companies = conn.execute(sa.text("SELECT id FROM company")).fetchall()

    for (company_id,) in companies:
        # Seed default India salary components.
        for name, ctype, calc, value, statutory, taxable, order in DEFAULT_INDIA_COMPONENTS:
            conn.execute(
                sa.text(
                    "INSERT INTO salary_component "
                    "(id, company_id, name, component_type, calculation_type, value, is_statutory, is_taxable, is_active, display_order, created_at, updated_at) "
                    "VALUES (:id, :company_id, :name, :ctype, :calc, :value, :statutory, :taxable, true, :order, now(), now())"
                ),
                {
                    "id": str(uuid.uuid4()), "company_id": str(company_id), "name": name,
                    "ctype": ctype, "calc": calc, "value": value,
                    "statutory": statutory, "taxable": taxable, "order": order,
                },
            )

        # Seed a "Loss of Pay" leave type, unpaid, if one doesn't already exist.
        existing_lop = conn.execute(
            sa.text("SELECT id FROM leave_type WHERE company_id = :cid AND name = 'Loss of Pay'"),
            {"cid": str(company_id)},
        ).first()
        if not existing_lop:
            conn.execute(
                sa.text(
                    "INSERT INTO leave_type (id, company_id, name, accrual_rate, is_paid, created_at, updated_at) "
                    "VALUES (:id, :cid, 'Loss of Pay', 0, false, now(), now())"
                ),
                {"id": str(uuid.uuid4()), "cid": str(company_id)},
            )

        # Seed a "Payroll Manager" role, if one doesn't already exist.
        existing_role = conn.execute(
            sa.text("SELECT id FROM role WHERE company_id = :cid AND name = 'Payroll Manager'"),
            {"cid": str(company_id)},
        ).first()
        if not existing_role:
            conn.execute(
                sa.text(
                    "INSERT INTO role (id, company_id, name, permissions, created_at, updated_at) "
                    "VALUES (:id, :cid, 'Payroll Manager', CAST(:perms AS json), now(), now())"
                ),
                {"id": str(uuid.uuid4()), "cid": str(company_id), "perms": json.dumps(PAYROLL_MANAGER_PERMISSIONS)},
            )

    # Backfill payroll:* permissions onto every existing company's Admin role.
    admin_roles = conn.execute(sa.text("SELECT id, permissions FROM role WHERE name = 'Admin'")).fetchall()
    for role_id, permissions in admin_roles:
        merged = dict(permissions or {})
        merged.update(ADMIN_EXTRA_PERMISSIONS)
        conn.execute(
            sa.text("UPDATE role SET permissions = CAST(:permissions AS json) WHERE id = :id"),
            {"id": str(role_id), "permissions": json.dumps(merged)},
        )


def downgrade() -> None:
    op.drop_table("payslip_line")
    op.drop_table("payslip")
    op.drop_table("payroll_run")
    op.drop_table("employee_salary_assignment")
    op.drop_table("salary_structure_component")
    op.drop_table("salary_structure")
    op.drop_table("salary_component")
    op.drop_column("leave_type", "is_paid")
    op.drop_column("company", "weekly_off_days")
