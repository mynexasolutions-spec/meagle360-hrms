"""PMS: per-company review window (additive columns only).

Revision ID: 033_pms_review_window
Revises: 032_pms_monthly
Create Date: 2026-11-25
"""

from alembic import op
import sqlalchemy as sa

revision = "033_pms_review_window"
down_revision = "032_pms_monthly"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pms_config", sa.Column(
        "review_opens_days", sa.SmallInteger, nullable=False, server_default="3"))
    op.add_column("pms_config", sa.Column(
        "review_due_day", sa.SmallInteger, nullable=False, server_default="5"))
    op.create_check_constraint(
        "ck_pms_config_review_window", "pms_config",
        "review_opens_days BETWEEN 1 AND 31 AND review_due_day BETWEEN 1 AND 28")


def downgrade() -> None:
    op.drop_constraint("ck_pms_config_review_window", "pms_config", type_="check")
    op.drop_column("pms_config", "review_due_day")
    op.drop_column("pms_config", "review_opens_days")
