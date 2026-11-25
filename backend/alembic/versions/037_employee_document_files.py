"""Uploaded files for employee_document (new nullable columns; saved links are untouched).

Revision ID: 037_employee_document_files
Revises: 036_required_documents
Create Date: 2026-11-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "037_employee_document_files"
down_revision = "036_required_documents"
branch_labels = None
depends_on = None

TABLE = "employee_document"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("filename", sa.String(200)))
    op.add_column(TABLE, sa.Column("content_type", sa.String(50)))
    op.add_column(TABLE, sa.Column("storage_id", sa.String(100)))
    op.add_column(TABLE, sa.Column("storage_path", sa.String(300)))
    op.add_column(TABLE, sa.Column(
        "uploaded_by_employee_id", UUID(as_uuid=True), sa.ForeignKey("employee.id", ondelete="SET NULL")))


def downgrade() -> None:
    for name in ("uploaded_by_employee_id", "storage_path", "storage_id", "content_type", "filename"):
        op.drop_column(TABLE, name)
