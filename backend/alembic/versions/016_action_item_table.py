"""Recovery migration for the action_item table.

This table was created directly against the shared Supabase DB by an
earlier, uncommitted migration (revision 6094c264476c) whose file was
never committed to version control. This migration recreates the same
table definition (verified against the live DB via SQLAlchemy inspector)
so migration history is consistent going forward. It is applied via a
manual alembic_version update, not upgrade(), since the table already
exists. upgrade() is kept so this migration is valid for a fresh DB build.

Revision ID: 016_action_item_table
Revises: 015_regularization_monthly_limit
Create Date: 2026-08-28
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "016_action_item_table"
down_revision: Union[str, None] = "015_regularization_monthly_limit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "action_item",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("assigned_to_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("priority", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("completion_note", sa.Text, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("action_item")
