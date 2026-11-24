"""Phase 1: Application stage history table, stage_entered_at, version, and Kanban indexes.

Creates table:
- application_stage_history

Alters table:
- applications: adds stage_entered_at, version, and composite indexes for Kanban counts & pagination.

Revision ID: 028_ats_stage_history
Revises: 027_ats_careers_settings
Create Date: 2026-11-24
"""

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "028_ats_stage_history"
down_revision = "027_ats_careers_settings"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # ── 1. Alter applications table ───────────────────────
    op.add_column(
        "applications",
        sa.Column("stage_entered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "applications",
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
    )

    # Backfill stage_entered_at from updated_at / created_at
    op.execute(
        sa.text(
            "UPDATE applications SET stage_entered_at = COALESCE(updated_at, created_at) "
            "WHERE stage_entered_at IS NULL"
        )
    )

    # Composite indexes for fast Kanban column counts & pagination
    op.create_index(
        "ix_applications_company_stage_updated",
        "applications",
        ["company_id", "stage_id", "updated_at"],
    )
    op.create_index(
        "ix_applications_company_job_stage",
        "applications",
        ["company_id", "job_id", "stage_id"],
    )

    # ── 2. Create application_stage_history table ─────────
    op.create_table(
        "application_stage_history",
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
            "from_stage_id",
            UUID,
            sa.ForeignKey("stages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "to_stage_id",
            UUID,
            sa.ForeignKey("stages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("from_stage", sa.String(100), nullable=True),
        sa.Column("to_stage", sa.String(100), nullable=True),
        sa.Column(
            "changed_by",
            UUID,
            sa.ForeignKey("user_account.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            index=True,
        ),
        sa.Column("reason", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("application_stage_history")
    op.drop_index("ix_applications_company_job_stage", table_name="applications")
    op.drop_index("ix_applications_company_stage_updated", table_name="applications")
    op.drop_column("applications", "version")
    op.drop_column("applications", "stage_entered_at")
