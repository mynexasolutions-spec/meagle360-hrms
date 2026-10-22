"""Add failed_attempts and cooldown_until to employee_face_profile

Revision ID: 023_face_verification_cooldown
Revises: 022_selfie_verification
Create Date: 2026-10-22
"""

from alembic import op
import sqlalchemy as sa

revision = "023_face_verification_cooldown"
down_revision = "022_selfie_verification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employee_face_profile",
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "employee_face_profile",
        sa.Column("cooldown_until", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("employee_face_profile", "cooldown_until")
    op.drop_column("employee_face_profile", "failed_attempts")
