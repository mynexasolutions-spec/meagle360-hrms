"""Scope employee_code uniqueness to company, not globally

employee_code was globally unique across all tenants — meaning two
different companies could never both have an "EMP001". Fixes the
constraint to (company_id, employee_code) instead.

Revision ID: 006_employee_code_scope
Revises: 005_multi_role
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op

revision: str = "006_employee_code_scope"
down_revision: Union[str, None] = "005_multi_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("employee_employee_code_key", "employee", type_="unique")
    op.create_unique_constraint(
        "uq_employee_company_code", "employee", ["company_id", "employee_code"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_employee_company_code", "employee", type_="unique")
    op.create_unique_constraint("employee_employee_code_key", "employee", ["employee_code"])
