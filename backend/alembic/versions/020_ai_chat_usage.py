"""Add ai_chat_usage table for tracking and rate limiting daily AI chat quota.

Revision ID: 020_ai_chat_usage
Revises: 019_pms_tables
Create Date: 2026-10-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "020_ai_chat_usage"
down_revision = "019_pms_tables"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "ai_chat_usage",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "company_id",
            UUID,
            sa.ForeignKey("company.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            UUID,
            sa.ForeignKey("user_account.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("message_type", sa.String(50), nullable=False, server_default="chat"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            index=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_ai_chat_usage_user_created",
        "ai_chat_usage",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_chat_usage_user_created", table_name="ai_chat_usage")
    op.drop_table("ai_chat_usage")
