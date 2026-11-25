"""Company policies, versions, files and acknowledgements (new tables only).

Revision ID: 034_company_policies
Revises: 033_pms_review_window
Create Date: 2026-11-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "034_company_policies"
down_revision = "033_pms_review_window"
branch_labels = None
depends_on = None


def _id():
    return sa.Column("id", UUID(as_uuid=True), primary_key=True)


def _fk(name, target, ondelete="CASCADE", nullable=False):
    return sa.Column(name, UUID(as_uuid=True), sa.ForeignKey(target, ondelete=ondelete), nullable=nullable)


def _ts(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "company_policy", _id(), _fk("company_id", "company.id"),
        sa.Column("template_key", sa.String(50)),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False, server_default=""),
        sa.Column("attachment_id", UUID(as_uuid=True)),
        sa.Column("requires_ack", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("published_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("ack_version", sa.Integer, nullable=False, server_default="0"),
        _ts("created_at"), _ts("updated_at"),
        sa.UniqueConstraint("company_id", "template_key", name="uq_company_policy_template"),
        sa.CheckConstraint("status IN ('draft', 'published', 'hidden')", name="ck_company_policy_status"),
    )
    op.create_table(
        "company_policy_version", _id(), _fk("policy_id", "company_policy.id"),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("attachment_id", UUID(as_uuid=True)),
        _fk("published_by_employee_id", "employee.id", "SET NULL", True),
        _ts("published_at"),
        sa.UniqueConstraint("policy_id", "version", name="uq_company_policy_version"),
    )
    op.create_table(
        "company_policy_file", _id(), _fk("policy_id", "company_policy.id"),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content", sa.LargeBinary, nullable=False),
        _ts("created_at"),
    )
    op.create_table(
        "company_policy_ack", _id(), _fk("policy_id", "company_policy.id"),
        _fk("employee_id", "employee.id"),
        sa.Column("version", sa.Integer, nullable=False),
        _ts("acknowledged_at"),
        sa.UniqueConstraint("policy_id", "employee_id", "version", name="uq_company_policy_ack"),
    )
    op.create_index("ix_company_policy_company_id", "company_policy", ["company_id"])
    for table in ("company_policy_version", "company_policy_file", "company_policy_ack"):
        op.create_index(f"ix_{table}_policy_id", table, ["policy_id"])
    op.create_index("ix_company_policy_ack_employee_id", "company_policy_ack", ["employee_id"])


def downgrade() -> None:
    for table in ("company_policy_ack", "company_policy_file", "company_policy_version", "company_policy"):
        op.drop_table(table)
