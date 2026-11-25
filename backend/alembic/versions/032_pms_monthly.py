"""PMS: monthly reviews and yearly appraisals (additive columns only).

Revision ID: 032_pms_monthly
Revises: 031_department_head
Create Date: 2026-11-25
"""

from alembic import op
import sqlalchemy as sa

revision = "032_pms_monthly"
down_revision = "031_department_head"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing cycles stay 'custom' and keep working as before.
    op.add_column("review_cycle", sa.Column(
        "period_type", sa.String(12), nullable=False, server_default="custom"))
    op.create_check_constraint(
        "ck_review_cycle_period_type", "review_cycle",
        "period_type IN ('custom','monthly','appraisal')")
    op.create_index(
        "uq_review_cycle_company_month", "review_cycle", ["company_id", "start_date"],
        unique=True, postgresql_where=sa.text("period_type = 'monthly'"))

    op.add_column("review_participant", sa.Column("self_note", sa.Text, nullable=True))
    op.add_column("review_participant", sa.Column("manager_score", sa.SmallInteger, nullable=True))
    op.add_column("review_participant", sa.Column("manager_comment", sa.Text, nullable=True))
    op.add_column("review_participant", sa.Column("months_reviewed", sa.SmallInteger, nullable=True))
    op.create_check_constraint(
        "ck_review_participant_manager_score", "review_participant",
        "manager_score IS NULL OR manager_score BETWEEN 1 AND 5")


def downgrade() -> None:
    op.drop_constraint("ck_review_participant_manager_score", "review_participant", type_="check")
    for c in ("months_reviewed", "manager_comment", "manager_score", "self_note"):
        op.drop_column("review_participant", c)
    op.drop_index("uq_review_cycle_company_month", table_name="review_cycle")
    op.drop_constraint("ck_review_cycle_period_type", "review_cycle", type_="check")
    op.drop_column("review_cycle", "period_type")
