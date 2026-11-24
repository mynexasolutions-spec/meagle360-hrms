"""Phase 3 & 4: Application assignment, assignment history, and distribution settings.

Alters table:
- applications: adds assigned_to (nullable FK employee.id) and composite index.

Creates tables:
- application_assignment_history
- ats_distribution_settings

Revision ID: 030_ats_distribution
Revises: 029_ats_application_notes
Create Date: 2026-11-24
"""

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "030_ats_distribution"
down_revision = "029_ats_application_notes"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # ── 1. Alter applications table ───────────────────────
    op.add_column(
        "applications",
        sa.Column(
            "assigned_to",
            UUID,
            sa.ForeignKey("employee.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_applications_assigned_to", "applications", ["assigned_to"])
    op.create_index(
        "ix_applications_company_assigned_stage",
        "applications",
        ["company_id", "assigned_to", "stage_id"],
    )

    # ── 2. Create application_assignment_history table ────
    op.create_table(
        "application_assignment_history",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column(
            "company_id",
            UUID,
            sa.ForeignKey("company.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "application_id",
            UUID,
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "from_assignee_id",
            UUID,
            sa.ForeignKey("employee.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "to_assignee_id",
            UUID,
            sa.ForeignKey("employee.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "assigned_by",
            UUID,
            sa.ForeignKey("user_account.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("mode", sa.String(30), nullable=False, server_default="manual"),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
    )

    # ── 3. Create ats_distribution_settings table ─────────
    op.create_table(
        "ats_distribution_settings",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column(
            "company_id",
            UUID,
            sa.ForeignKey("company.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column(
            "auto_assign_enabled",
            sa.Boolean,
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "round_robin_pool_ids",
            sa.JSON,
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "last_assigned_index",
            sa.Integer,
            nullable=False,
            server_default="-1",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("ats_distribution_settings")
    op.drop_table("application_assignment_history")
    op.drop_index("ix_applications_company_assigned_stage", table_name="applications")
    op.drop_index("ix_applications_assigned_to", table_name="applications")
    op.drop_column("applications", "assigned_to")
