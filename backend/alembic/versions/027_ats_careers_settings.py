"""ATS Careers Page Customization Settings.

Creates table:
- careers_page_settings

Revision ID: 027_ats_careers_settings
Revises: 026_ats_offers
Create Date: 2026-10-24
"""

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "027_ats_careers_settings"
down_revision = "026_ats_offers"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "careers_page_settings",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("brand_name", sa.String(255), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("badge_text", sa.String(100), nullable=False, server_default="CAREERS"),
        sa.Column("title_prefix", sa.String(255), nullable=False, server_default="Join our"),
        sa.Column("title_highlight", sa.String(255), nullable=False, server_default="team"),
        sa.Column("subtitle", sa.Text, nullable=True),
        sa.Column("hero_image_url", sa.String(500), nullable=True),
        sa.Column("hero_card_badge", sa.String(100), nullable=False, server_default="Better Together"),
        sa.Column("hero_card_quote", sa.String(255), nullable=False, server_default="Better Code.\nBigger Dreams."),
        sa.Column("primary_color", sa.String(50), nullable=False, server_default="#1d68f5"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("careers_page_settings")
