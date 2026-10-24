"""Phase 4: ATS Offers & Employee Conversion.

Tables created:
- offers (Candidate offer records with versioning and status tracking)

Revision ID: 026_ats_offers
Revises: 025_ats_interviews
Create Date: 2026-10-24
"""

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "026_ats_offers"
down_revision = "025_ats_interviews"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # ── 1. offers table ───────────────────────────────────
    op.create_table(
        "offers",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("application_id", UUID, sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("designation", sa.String(255), nullable=False),
        sa.Column("ctc", sa.Numeric(12, 2), nullable=False),
        sa.Column("joining_date", sa.Date, nullable=False),
        sa.Column("reporting_manager_id", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True),
        sa.Column("probation_period_months", sa.Integer, nullable=False, server_default="3"),
        sa.Column("validity_date", sa.Date, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="Draft"),
        sa.Column("offer_letter_template", sa.Text, nullable=True),
        sa.Column("declined_reason", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        *_ts(),
        sa.UniqueConstraint("application_id", "version_number", name="uq_offer_app_version"),
    )


def downgrade() -> None:
    op.drop_table("offers")
