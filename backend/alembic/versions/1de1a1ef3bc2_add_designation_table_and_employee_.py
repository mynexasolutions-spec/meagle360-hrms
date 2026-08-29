"""add designation table and employee designation_id

Revision ID: 1de1a1ef3bc2
Revises: 016_action_item_table
Create Date: 2026-08-28 23:29:27.077021
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '1de1a1ef3bc2'
down_revision: Union[str, None] = '016_action_item_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('designation',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('company_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=150), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['company_id'], ['company.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_designation_company_id'), 'designation', ['company_id'], unique=False)
    op.add_column('employee', sa.Column('designation_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'employee', 'designation', ['designation_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'employee', type_='foreignkey')
    op.drop_column('employee', 'designation_id')
    op.drop_index(op.f('ix_designation_company_id'), table_name='designation')
    op.drop_table('designation')
