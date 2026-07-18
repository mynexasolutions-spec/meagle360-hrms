"""Multi-role support (user_account_role join) + 4 new role types

Adds a many-to-many join between user_account and role, backfills it from
the existing single `user_account.role_id` (zero data loss — role_id is
left untouched), and seeds 4 new role rows (HR Manager, Expense Manager,
Helpdesk Manager, Project Admin) into every existing company.

Revision ID: 005_multi_role
Revises: 004_workflows
Create Date: 2026-07-19
"""

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

revision: str = "005_multi_role"
down_revision: Union[str, None] = "004_workflows"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_ROLE_PERMISSIONS = {
    "HR Manager": {
        "employees:read": True, "employees:write": True,
        "attendance:read": True, "attendance:write": True, "attendance:approve": True,
        "leave:read": True, "leave:write": True, "leave:approve": True,
    },
    "Expense Manager": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
        "expenses:read": True, "expenses:write": True, "expenses:approve": True,
    },
    "Helpdesk Manager": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
        "helpdesk:read": True, "helpdesk:write": True, "helpdesk:manage": True,
    },
    "Project Admin": {
        "employees:read": True,
        "attendance:read": True, "attendance:write": True,
        "leave:read": True, "leave:write": True,
        "projects:read": True, "projects:write": True, "projects:manage": True,
    },
}


def upgrade() -> None:
    # ── 1. Join table ─────────────────────────────────────
    op.create_table(
        "user_account_role",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_account_id", UUID(as_uuid=True), sa.ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", UUID(as_uuid=True), sa.ForeignKey("role.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_account_id", "role_id", name="uq_user_account_role"),
    )
    op.create_index("ix_user_account_role_user_account_id", "user_account_role", ["user_account_id"])
    op.create_index("ix_user_account_role_role_id", "user_account_role", ["role_id"])

    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    # ── 2. Backfill: one join row per existing role_id assignment ──
    bind.execute(
        sa.text(
            """
            INSERT INTO user_account_role (id, user_account_id, role_id, created_at, updated_at)
            SELECT gen_random_uuid(), id, role_id, :now, :now
            FROM user_account
            WHERE role_id IS NOT NULL
            """
        ),
        {"now": now},
    )

    # ── 3. Seed the 4 new role types into every existing company ──
    company_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM company")).fetchall()]
    role_table = sa.table(
        "role",
        sa.column("id", UUID(as_uuid=True)),
        sa.column("company_id", UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("permissions", JSON),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    for company_id in company_ids:
        existing_names = {
            row[0]
            for row in bind.execute(
                sa.text("SELECT name FROM role WHERE company_id = :cid"), {"cid": company_id}
            ).fetchall()
        }
        for role_name, permissions in NEW_ROLE_PERMISSIONS.items():
            if role_name in existing_names:
                continue  # idempotent — don't duplicate on re-run
            bind.execute(
                role_table.insert().values(
                    id=uuid.uuid4(),
                    company_id=company_id,
                    name=role_name,
                    permissions=permissions,
                    created_at=now,
                    updated_at=now,
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    for role_name in NEW_ROLE_PERMISSIONS:
        bind.execute(sa.text("DELETE FROM role WHERE name = :name"), {"name": role_name})
    op.drop_table("user_account_role")
