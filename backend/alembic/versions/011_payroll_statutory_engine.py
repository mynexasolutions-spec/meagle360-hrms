"""Add statutory payroll engine: CTC/Basic-floor, employer contributions,
EPF/ESI eligibility tracking, tax slabs, PT slabs, employee loans, F&F.

Every threshold/rate introduced here is a company- or admin-configured
row, not a hardcoded constant — this migration only seeds illustrative
starting values that Admin is expected to review and adjust for their
own state(s) and the current tax year.

Revision ID: 011_payroll_statutory_engine
Revises: 010_payroll_management
Create Date: 2026-07-19
"""

import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "011_payroll_statutory_engine"
down_revision: Union[str, None] = "010_payroll_management"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Illustrative only — Admin must review/update for their state(s) and tax year.
NEW_REGIME_SLABS = [
    (0, 300000, 0),
    (300000, 700000, 5),
    (700000, 1000000, 10),
    (1000000, 1200000, 15),
    (1200000, 1500000, 20),
    (1500000, None, 30),
]
OLD_REGIME_SLABS = [
    (0, 250000, 0),
    (250000, 500000, 5),
    (500000, 1000000, 20),
    (1000000, None, 30),
]
DEFAULT_PT_SLABS = {
    "Karnataka": [(0, 15000, 0), (15000, None, 200)],
    "Maharashtra": [(0, 7500, 0), (7500, 10000, 175), (10000, None, 200)],
}


def upgrade() -> None:
    # ── Company: statutory policy thresholds ──────────────────────────
    op.add_column("company", sa.Column("min_basic_percent_of_ctc", sa.Numeric(5, 2), nullable=False, server_default="50"))
    op.add_column("company", sa.Column("epf_threshold_employee_count", sa.Integer, nullable=False, server_default="20"))
    op.add_column("company", sa.Column("esi_threshold_employee_count", sa.Integer, nullable=False, server_default="10"))
    op.add_column("company", sa.Column("esi_wage_ceiling", sa.Numeric(10, 2), nullable=False, server_default="21000"))
    op.add_column("company", sa.Column("gratuity_threshold_employee_count", sa.Integer, nullable=False, server_default="10"))
    op.add_column("company", sa.Column("gratuity_years_regular", sa.Numeric(4, 1), nullable=False, server_default="5"))
    op.add_column("company", sa.Column("gratuity_years_fixed_term", sa.Numeric(4, 1), nullable=False, server_default="1"))
    op.add_column("company", sa.Column("fnf_settlement_days", sa.Integer, nullable=False, server_default="2"))
    op.add_column("company", sa.Column("standard_working_hours_per_day", sa.Numeric(4, 2), nullable=False, server_default="8"))
    op.add_column("company", sa.Column("overtime_rate_multiplier", sa.Numeric(4, 2), nullable=False, server_default="2"))
    op.add_column("company", sa.Column("tds_cess_percent", sa.Numeric(5, 2), nullable=False, server_default="4"))
    op.add_column("company", sa.Column("epf_registered", sa.Boolean, nullable=False, server_default=sa.false()))

    # ── Employee: classification + statutory identifiers ──────────────
    op.add_column("employee", sa.Column("employment_type", sa.String(20), nullable=False, server_default="full_time"))
    op.add_column("employee", sa.Column("date_of_exit", sa.Date, nullable=True))
    op.add_column("employee", sa.Column("exit_reason", sa.String(255), nullable=True))
    op.add_column("employee", sa.Column("pan_number", sa.String(20), nullable=True))
    op.add_column("employee", sa.Column("uan_number", sa.String(20), nullable=True))
    op.add_column("employee", sa.Column("bank_account_number", sa.String(40), nullable=True))
    op.add_column("employee", sa.Column("bank_ifsc", sa.String(20), nullable=True))
    op.add_column("employee", sa.Column("epf_applicable", sa.Boolean, nullable=True))
    op.add_column("employee", sa.Column("esi_applicable", sa.Boolean, nullable=True))
    op.add_column("employee", sa.Column("esi_number", sa.String(30), nullable=True))
    op.add_column("employee", sa.Column("esi_registered_date", sa.Date, nullable=True))
    op.add_column("employee", sa.Column("esi_coverage_cycle_end", sa.Date, nullable=True))
    op.add_column("employee", sa.Column("tax_regime", sa.String(10), nullable=True))
    op.add_column("employee", sa.Column("declared_investments", sa.Numeric(12, 2), nullable=False, server_default="0"))

    # ── SalaryComponent: engine-control flags ──────────────────────────
    op.add_column("salary_component", sa.Column("is_employer_contribution", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("salary_component", sa.Column("is_balancing_figure", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("salary_component", sa.Column("statutory_type", sa.String(20), nullable=True))

    # ── EmployeeSalaryAssignment: CTC ───────────────────────────────────
    op.add_column("employee_salary_assignment", sa.Column("annual_ctc", sa.Numeric(12, 2), nullable=True))

    # ── ExpenseClaim: link to the payslip it was paid through ──────────
    op.add_column("expense_claim", sa.Column("paid_via_payslip_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payslip.id", ondelete="SET NULL"), nullable=True))

    # ── New tables ───────────────────────────────────────────────────
    op.create_table(
        "tax_slab",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("regime", sa.String(10), nullable=False),
        sa.Column("min_income", sa.Numeric(14, 2), nullable=False),
        sa.Column("max_income", sa.Numeric(14, 2), nullable=True),
        sa.Column("rate_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "professional_tax_slab",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("state", sa.String(100), nullable=False),
        sa.Column("min_gross", sa.Numeric(12, 2), nullable=False),
        sa.Column("max_gross", sa.Numeric(12, 2), nullable=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "employee_loan",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("principal_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("monthly_installment", sa.Numeric(12, 2), nullable=False),
        sa.Column("remaining_balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "fnf_settlement",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("exit_date", sa.Date, nullable=False),
        sa.Column("pending_salary_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("leave_encashment_days", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("leave_encashment_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("gratuity_eligible", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("gratuity_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("outstanding_deductions", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("net_payable", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── Backfill: classify existing salary components ─────────────────
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE salary_component SET statutory_type = 'epf'
        WHERE name ILIKE '%%EPF%%' OR name ILIKE '%%provident fund%%'
    """))
    conn.execute(sa.text("UPDATE salary_component SET statutory_type = 'esi' WHERE name ILIKE '%%ESI%%'"))
    conn.execute(sa.text("UPDATE salary_component SET statutory_type = 'pt' WHERE name = 'Professional Tax'"))
    conn.execute(sa.text("UPDATE salary_component SET statutory_type = 'tds' WHERE name ILIKE '%%TDS%%'"))
    conn.execute(sa.text("UPDATE salary_component SET is_balancing_figure = true WHERE name = 'Special Allowance'"))

    companies = conn.execute(sa.text("SELECT id FROM company")).fetchall()
    for (company_id,) in companies:
        # Employer PF — a CTC cost, never paid to the employee, gated by
        # the same EPF eligibility rules as the employee's own deduction.
        conn.execute(sa.text("""
            INSERT INTO salary_component
                (id, company_id, name, component_type, calculation_type, value,
                 is_statutory, is_taxable, is_active, display_order,
                 is_employer_contribution, is_balancing_figure, statutory_type,
                 created_at, updated_at)
            VALUES (:id, :cid, 'Employer PF Contribution', 'earning', 'percent_of_basic', 12,
                    true, false, true, 5, true, false, 'epf', now(), now())
        """), {"id": str(uuid.uuid4()), "cid": str(company_id)})

        # Illustrative tax slabs — Admin must verify against the current
        # assessment year and update as rates/brackets change.
        for regime, slabs in (("new", NEW_REGIME_SLABS), ("old", OLD_REGIME_SLABS)):
            for min_income, max_income, rate in slabs:
                conn.execute(sa.text("""
                    INSERT INTO tax_slab (id, company_id, regime, min_income, max_income, rate_percent, created_at, updated_at)
                    VALUES (:id, :cid, :regime, :min_income, :max_income, :rate, now(), now())
                """), {
                    "id": str(uuid.uuid4()), "cid": str(company_id), "regime": regime,
                    "min_income": min_income, "max_income": max_income, "rate": rate,
                })

        # Illustrative PT slabs for a couple of states — Admin adds their
        # own state(s); a state with no rows configured means PT doesn't
        # apply to employees registered there.
        for state, slabs in DEFAULT_PT_SLABS.items():
            for min_gross, max_gross, amount in slabs:
                conn.execute(sa.text("""
                    INSERT INTO professional_tax_slab (id, company_id, state, min_gross, max_gross, amount, created_at, updated_at)
                    VALUES (:id, :cid, :state, :min_gross, :max_gross, :amount, now(), now())
                """), {
                    "id": str(uuid.uuid4()), "cid": str(company_id), "state": state,
                    "min_gross": min_gross, "max_gross": max_gross, "amount": amount,
                })


def downgrade() -> None:
    op.drop_table("fnf_settlement")
    op.drop_table("employee_loan")
    op.drop_table("professional_tax_slab")
    op.drop_table("tax_slab")
    op.drop_column("expense_claim", "paid_via_payslip_id")
    op.drop_column("employee_salary_assignment", "annual_ctc")
    op.drop_column("salary_component", "statutory_type")
    op.drop_column("salary_component", "is_balancing_figure")
    op.drop_column("salary_component", "is_employer_contribution")
    op.drop_column("employee", "declared_investments")
    op.drop_column("employee", "tax_regime")
    op.drop_column("employee", "esi_coverage_cycle_end")
    op.drop_column("employee", "esi_registered_date")
    op.drop_column("employee", "esi_number")
    op.drop_column("employee", "esi_applicable")
    op.drop_column("employee", "epf_applicable")
    op.drop_column("employee", "bank_ifsc")
    op.drop_column("employee", "bank_account_number")
    op.drop_column("employee", "uan_number")
    op.drop_column("employee", "pan_number")
    op.drop_column("employee", "exit_reason")
    op.drop_column("employee", "date_of_exit")
    op.drop_column("employee", "employment_type")
    op.drop_column("company", "epf_registered")
    op.drop_column("company", "tds_cess_percent")
    op.drop_column("company", "overtime_rate_multiplier")
    op.drop_column("company", "standard_working_hours_per_day")
    op.drop_column("company", "fnf_settlement_days")
    op.drop_column("company", "gratuity_years_fixed_term")
    op.drop_column("company", "gratuity_years_regular")
    op.drop_column("company", "gratuity_threshold_employee_count")
    op.drop_column("company", "esi_wage_ceiling")
    op.drop_column("company", "esi_threshold_employee_count")
    op.drop_column("company", "epf_threshold_employee_count")
    op.drop_column("company", "min_basic_percent_of_ctc")
