"""Company policies: allow 'deleted', and drop untouched starter drafts so the
app publishes the new starter text in their place.

Revision ID: 035_policy_defaults_live
Revises: 034_company_policies
Create Date: 2026-11-25
"""

from alembic import op

revision = "035_policy_defaults_live"
down_revision = "034_company_policies"
branch_labels = None
depends_on = None


def _status_check(values: str) -> None:
    op.drop_constraint("ck_company_policy_status", "company_policy", type_="check")
    op.create_check_constraint("ck_company_policy_status", "company_policy", f"status IN ({values})")


def upgrade() -> None:
    _status_check("'draft', 'published', 'hidden', 'deleted'")
    # Never published and never edited: nothing anyone wrote or agreed to.
    op.execute(
        "DELETE FROM company_policy WHERE template_key IS NOT NULL AND status = 'draft' "
        "AND published_version = 0 AND updated_at - created_at < interval '1 second'")


def downgrade() -> None:
    op.execute("UPDATE company_policy SET status = 'hidden' WHERE status = 'deleted'")
    _status_check("'draft', 'published', 'hidden'")
