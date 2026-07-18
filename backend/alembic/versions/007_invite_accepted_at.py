"""Add invite_accepted_at to user_account

Tracks when a user redeems their set-password invite link, so the
directory/UI can distinguish "invited, not yet logged in" from "active".
Existing accounts are backfilled to their created_at since they were
seeded with real, working passwords — they're de facto already active.

Revision ID: 007_invite_accepted_at
Revises: 006_employee_code_scope
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "007_invite_accepted_at"
down_revision: Union[str, None] = "006_employee_code_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_account",
        sa.Column("invite_accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE user_account SET invite_accepted_at = created_at")


def downgrade() -> None:
    op.drop_column("user_account", "invite_accepted_at")
