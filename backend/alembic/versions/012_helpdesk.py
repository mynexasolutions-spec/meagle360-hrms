"""Add HR Helpdesk: tickets + threaded replies.

Revision ID: 012_helpdesk
Revises: c124f59cbb68
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "012_helpdesk"
down_revision = "c124f59cbb68"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "helpdesk_ticket",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "helpdesk_ticket_reply",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("helpdesk_ticket.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("author_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("author_role", sa.String(20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("helpdesk_ticket_reply")
    op.drop_table("helpdesk_ticket")
