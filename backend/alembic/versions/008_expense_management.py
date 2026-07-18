"""Add Expense Management (categories + claims)

Creates expense_category and expense_claim tables, seeds default categories
for every existing company, and patches existing companies' Admin/Manager/
Employee/HR Manager/Expense Manager roles with the new expenses:* permission
keys (mirrors the same "patch already-seeded roles" step done for
attendance:approve during the multi-role rollout — new permission keys only
take effect for companies created after this migration unless backfilled).

Revision ID: 008_expense_management
Revises: 007_invite_accepted_at
Create Date: 2026-07-18
"""

import json
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008_expense_management"
down_revision: Union[str, None] = "007_invite_accepted_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_EXPENSE_CATEGORIES = ["Travel", "Meals & Entertainment", "Office Supplies", "Transportation", "Other"]

ROLE_EXPENSE_PERMISSIONS = {
    "Admin": {"expenses:read": True, "expenses:write": True, "expenses:approve": True},
    "Manager": {"expenses:read": True, "expenses:approve": True},
    "Employee": {"expenses:read": True, "expenses:write": True},
    "HR Manager": {"expenses:read": True, "expenses:write": True, "expenses:approve": True},
    "Expense Manager": {"expenses:read": True, "expenses:write": True, "expenses:approve": True},
}


def upgrade() -> None:
    op.create_table(
        "expense_category",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "expense_claim",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("expense_category.id", ondelete="SET NULL"), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_date", sa.Date, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("receipt_url", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reimbursed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    conn = op.get_bind()

    # Seed default categories for every existing company.
    company_ids = [row[0] for row in conn.execute(sa.text("SELECT id FROM company")).fetchall()]
    if company_ids:
        insert_stmt = sa.text(
            "INSERT INTO expense_category (id, company_id, name, created_at, updated_at) "
            "VALUES (:id, :company_id, :name, now(), now())"
        )
        for company_id in company_ids:
            for category_name in DEFAULT_EXPENSE_CATEGORIES:
                conn.execute(insert_stmt, {"id": str(uuid.uuid4()), "company_id": str(company_id), "name": category_name})

    # Backfill expenses:* permission keys onto existing roles (JSON column,
    # not JSONB — merge in Python rather than relying on a jsonb `||` operator).
    rows = conn.execute(sa.text("SELECT id, name, permissions FROM role")).fetchall()
    update_stmt = sa.text("UPDATE role SET permissions = CAST(:permissions AS json) WHERE id = :id")
    for role_id, role_name, permissions in rows:
        extra = ROLE_EXPENSE_PERMISSIONS.get(role_name)
        if not extra:
            continue
        merged = dict(permissions or {})
        merged.update(extra)
        conn.execute(update_stmt, {"id": str(role_id), "permissions": json.dumps(merged)})


def downgrade() -> None:
    op.drop_table("expense_claim")
    op.drop_table("expense_category")
