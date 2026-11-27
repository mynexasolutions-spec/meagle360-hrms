"""Skills the candidate picks on the application form.

Stored per application as [{"name": canonical skill, "years": number | null}].
The scorer gives a job skill that only appears here half credit, and the
recruiter sees which claimed skills the resume backs up.

Revision ID: 044_application_declared_skills
Revises: 043_bank_detail_requests
Create Date: 2026-11-27
"""

from alembic import op
import sqlalchemy as sa

revision = "044_application_declared_skills"
down_revision = "043_bank_detail_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("applications", sa.Column("declared_skills", sa.JSON, nullable=True))


def downgrade() -> None:
    op.drop_column("applications", "declared_skills")
