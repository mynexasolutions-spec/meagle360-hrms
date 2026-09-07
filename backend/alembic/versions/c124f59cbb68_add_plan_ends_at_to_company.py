"""add plan_ends_at to company

Revision ID: c124f59cbb68
Revises: 5ef7a4f723e8
Create Date: 2026-09-04 12:39:19.200345

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c124f59cbb68'
down_revision: Union[str, None] = '5ef7a4f723e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTE: autogenerate also detected 'jobs', 'job_applications', 'posts',
    # 'contact_submissions' as removed tables — these belong to a separate
    # schema/project sharing this DB, not to HRMS models. Deliberately left
    # untouched; only the plan_ends_at column change is applied here.
    op.add_column('company', sa.Column('plan_ends_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('company', 'plan_ends_at')
