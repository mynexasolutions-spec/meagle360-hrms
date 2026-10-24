"""Phase 3: ATS Interviews, Settings, Round Templates, Panel, and Feedback.

Tables created:
- interview_round_templates
- rejection_reasons
- interviews
- interview_panel
- interview_feedback

Seeds default round templates and rejection reasons for existing companies.

Revision ID: 025_ats_interviews
Revises: 024_ats_foundation
Create Date: 2026-10-24
"""

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "025_ats_interviews"
down_revision = "024_ats_foundation"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # ── 1. interview_round_templates ─────────────────────
    op.create_table(
        "interview_round_templates",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    # ── 2. rejection_reasons ─────────────────────────────
    op.create_table(
        "rejection_reasons",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    # ── 3. interviews ────────────────────────────────────
    op.create_table(
        "interviews",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("application_id", UUID, sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("round_template_id", UUID, sa.ForeignKey("interview_round_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("round_name", sa.String(100), nullable=False),
        sa.Column("round_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("interview_type", sa.String(50), nullable=False, server_default="video"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer, nullable=False, server_default="45"),
        sa.Column("meeting_link_or_location", sa.String(500), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="Needs interviewer", index=True),
        *_ts(),
    )

    # ── 4. interview_panel ───────────────────────────────
    op.create_table(
        "interview_panel",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("interview_id", UUID, sa.ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("employee_id", UUID, sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
    )

    # ── 5. interview_feedback ────────────────────────────
    op.create_table(
        "interview_feedback",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("interview_id", UUID, sa.ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("interviewer_id", UUID, sa.ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("attended", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("rating", sa.Integer, nullable=True),
        sa.Column("recommendation", sa.String(30), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        *_ts(),
    )

    # ── 6. Seed default round templates & rejection reasons ──
    bind = op.get_bind()
    companies = bind.execute(sa.text("SELECT id FROM company")).fetchall()

    default_rounds = [
        ("Technical Round", 1),
        ("HR Round", 2),
        ("Managerial Round", 3),
    ]

    default_reasons = [
        "Qualifications did not match job requirements",
        "Salary expectation mismatch",
        "Notice period too long",
        "Position filled by another candidate",
        "Did not attend screening/interview",
        "Cultural / Communication fit",
        "Other",
    ]

    for comp in companies:
        c_id = comp[0]
        for name, order in default_rounds:
            bind.execute(
                sa.text("""
                    INSERT INTO interview_round_templates (id, company_id, name, display_order, is_active, created_at, updated_at)
                    VALUES (:id, :company_id, :name, :display_order, true, NOW(), NOW())
                """),
                {"id": str(uuid.uuid4()), "company_id": str(c_id), "name": name, "display_order": order}
            )

        for r_text in default_reasons:
            bind.execute(
                sa.text("""
                    INSERT INTO rejection_reasons (id, company_id, reason, is_active, created_at, updated_at)
                    VALUES (:id, :company_id, :reason, true, NOW(), NOW())
                """),
                {"id": str(uuid.uuid4()), "company_id": str(c_id), "reason": r_text}
            )


def downgrade() -> None:
    op.drop_table("interview_feedback")
    op.drop_table("interview_panel")
    op.drop_table("interviews")
    op.drop_table("rejection_reasons")
    op.drop_table("interview_round_templates")
