"""Add Sites + full employee profile fields (photo, personal info)

Creates the site table (a physical work location/branch) and adds site_id
to employee plus richer profile fields: photo_url, personal_email, phone,
date_of_birth, gender, address, emergency_contact_name/phone.

Revision ID: 009_sites_employee_profile
Revises: 008_expense_management
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "009_sites_employee_profile"
down_revision: Union[str, None] = "008_expense_management"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "site",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.add_column("employee", sa.Column("site_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("site.id", ondelete="SET NULL"), nullable=True))
    op.add_column("employee", sa.Column("photo_url", sa.String(500), nullable=True))
    op.add_column("employee", sa.Column("personal_email", sa.String(255), nullable=True))
    op.add_column("employee", sa.Column("phone", sa.String(30), nullable=True))
    op.add_column("employee", sa.Column("date_of_birth", sa.Date, nullable=True))
    op.add_column("employee", sa.Column("gender", sa.String(30), nullable=True))
    op.add_column("employee", sa.Column("address", sa.Text, nullable=True))
    op.add_column("employee", sa.Column("emergency_contact_name", sa.String(255), nullable=True))
    op.add_column("employee", sa.Column("emergency_contact_phone", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("employee", "emergency_contact_phone")
    op.drop_column("employee", "emergency_contact_name")
    op.drop_column("employee", "address")
    op.drop_column("employee", "gender")
    op.drop_column("employee", "date_of_birth")
    op.drop_column("employee", "phone")
    op.drop_column("employee", "personal_email")
    op.drop_column("employee", "photo_url")
    op.drop_column("employee", "site_id")
    op.drop_table("site")
