"""Expense receipts as private ImageKit uploads; categories can be switched off.

expense_claim keeps receipt_url for claims saved with a link before uploads
existed. Categories are deactivated rather than deleted, so old claims keep
their category name.

Revision ID: 042_expense_receipts
Revises: 041_employee_offboarding
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa

revision = "042_expense_receipts"
down_revision = "041_employee_offboarding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("expense_claim", sa.Column("receipt_filename", sa.String(200), nullable=True))
    op.add_column("expense_claim", sa.Column("receipt_content_type", sa.String(50), nullable=True))
    op.add_column("expense_claim", sa.Column("receipt_storage_id", sa.String(100), nullable=True))
    op.add_column("expense_claim", sa.Column("receipt_storage_path", sa.String(500), nullable=True))
    op.add_column(
        "expense_category",
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("expense_category", "is_active")
    op.drop_column("expense_claim", "receipt_storage_path")
    op.drop_column("expense_claim", "receipt_storage_id")
    op.drop_column("expense_claim", "receipt_content_type")
    op.drop_column("expense_claim", "receipt_filename")
