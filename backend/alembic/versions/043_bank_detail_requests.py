"""Employee PAN / bank change requests, and bank details frozen on finalized payslips.

Payslips used to read PAN and bank details live from the employee, so an
account change rewrote old payslips too. Finalized payslips now keep their
own copy; existing finalized payslips are filled from the employee's current
details (the best record there is).

Revision ID: 043_bank_detail_requests
Revises: 042_expense_receipts
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "043_bank_detail_requests"
down_revision = "042_expense_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_detail_request",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pan_number", sa.String(20), nullable=True),
        sa.Column("bank_account_number", sa.String(40), nullable=True),
        sa.Column("bank_ifsc", sa.String(20), nullable=True),
        sa.Column("bank_name", sa.String(150), nullable=True),
        sa.Column("proof_filename", sa.String(200), nullable=True),
        sa.Column("proof_content_type", sa.String(50), nullable=True),
        sa.Column("proof_storage_id", sa.String(100), nullable=True),
        sa.Column("proof_storage_path", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("review_note", sa.Text, nullable=True),
        sa.Column("reviewed_by_employee_id", UUID(as_uuid=True),
                  sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_bank_detail_request_company_id", "bank_detail_request", ["company_id"])
    op.create_index("ix_bank_detail_request_employee_id", "bank_detail_request", ["employee_id"])
    op.create_index("ix_bank_detail_request_status", "bank_detail_request", ["status"])

    op.add_column("payslip", sa.Column("pan_number", sa.String(20), nullable=True))
    op.add_column("payslip", sa.Column("bank_account_number", sa.String(40), nullable=True))
    op.add_column("payslip", sa.Column("bank_ifsc", sa.String(20), nullable=True))
    op.add_column("payslip", sa.Column("bank_name", sa.String(150), nullable=True))
    op.execute("""
        UPDATE payslip p
        SET pan_number = e.pan_number, bank_account_number = e.bank_account_number,
            bank_ifsc = e.bank_ifsc, bank_name = e.bank_name
        FROM employee e, payroll_run r
        WHERE e.id = p.employee_id AND r.id = p.payroll_run_id AND r.status = 'finalized'
    """)


def downgrade() -> None:
    op.drop_column("payslip", "bank_name")
    op.drop_column("payslip", "bank_ifsc")
    op.drop_column("payslip", "bank_account_number")
    op.drop_column("payslip", "pan_number")
    op.drop_index("ix_bank_detail_request_status", "bank_detail_request")
    op.drop_index("ix_bank_detail_request_employee_id", "bank_detail_request")
    op.drop_index("ix_bank_detail_request_company_id", "bank_detail_request")
    op.drop_table("bank_detail_request")
