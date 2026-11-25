"""Required employee documents and the files uploaded for them (new tables only).

Revision ID: 036_required_documents
Revises: 035_policy_defaults_live
Create Date: 2026-11-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "036_required_documents"
down_revision = "035_policy_defaults_live"
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
        "required_document", _id(), _fk("company_id", "company.id"),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("instructions", sa.String(300), nullable=False, server_default=""),
        sa.Column("mandatory", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("department_ids", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("employment_types", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.false()),
        _ts("created_at"), _ts("updated_at"),
    )
    op.create_index("ix_required_document_company_id", "required_document", ["company_id"])
    op.create_table(
        "required_document_file", _id(), _fk("company_id", "company.id"),
        _fk("required_document_id", "required_document.id"), _fk("employee_id", "employee.id"),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(50), nullable=False),
        sa.Column("size", sa.Integer, nullable=False),
        sa.Column("storage_id", sa.String(100), nullable=False),
        sa.Column("storage_path", sa.String(300), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="uploaded"),
        sa.Column("review_note", sa.String(300), nullable=False, server_default=""),
        _fk("uploaded_by_employee_id", "employee.id", "SET NULL", True), _ts("uploaded_at"),
        _fk("reviewed_by_employee_id", "employee.id", "SET NULL", True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("required_document_id", "employee_id", name="uq_required_document_file"),
        sa.CheckConstraint(
            "status IN ('uploaded', 'verified', 'rejected')", name="ck_required_document_file_status"),
    )
    op.create_index("ix_required_document_file_company_id", "required_document_file", ["company_id"])
    op.create_index("ix_required_document_file_employee_id", "required_document_file", ["employee_id"])
    # ID proofs must only be reachable through the API, never Supabase's public REST endpoint.
    op.execute("ALTER TABLE required_document ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE required_document_file ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("required_document_file")
    op.drop_table("required_document")
