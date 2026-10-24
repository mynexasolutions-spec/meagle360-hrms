"""Phase 0: ATS Foundation schema, tables, and seeding for default stages and roles.

Tables created:
- stages
- job_openings
- candidates
- applications
- application_activities

Seeds default hiring stages and Recruiter/Interviewer roles for all existing companies.

Revision ID: 024_ats_foundation
Revises: 023_face_verification_cooldown
Create Date: 2026-10-24
"""

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "024_ats_foundation"
down_revision = "023_face_verification_cooldown"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # ── 1. stages table ───────────────────────────────────
    op.create_table(
        "stages",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_initial", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_terminal", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("terminal_type", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
        sa.UniqueConstraint("company_id", "name", name="uq_stage_company_name"),
    )

    # ── 2. job_openings table ─────────────────────────────
    op.create_table(
        "job_openings",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("department_id", UUID, sa.ForeignKey("department.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("department_name", sa.String(255), nullable=True),
        sa.Column("designation_id", UUID, sa.ForeignKey("designation.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("designation_name", sa.String(255), nullable=True),
        sa.Column("number_of_openings", sa.Integer, nullable=False, server_default="1"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("responsibilities", sa.Text, nullable=True),
        sa.Column("requirements", sa.Text, nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("job_type", sa.String(50), nullable=False, server_default="Full-time"),
        sa.Column("status", sa.String(20), nullable=False, server_default="Draft", index=True),
        sa.Column("experience_range", sa.String(50), nullable=True),
        sa.Column("created_by_id", UUID, sa.ForeignKey("user_account.id", ondelete="SET NULL"), nullable=True),
        *_ts(),
    )

    # ── 3. candidates table ───────────────────────────────
    op.create_table(
        "candidates",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("current_location", sa.String(255), nullable=True),
        sa.Column("years_of_experience", sa.Numeric(4, 1), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        *_ts(),
        sa.UniqueConstraint("company_id", "email", name="uq_candidate_company_email"),
    )

    # ── 4. applications table ─────────────────────────────
    op.create_table(
        "applications",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("candidate_id", UUID, sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("job_id", UUID, sa.ForeignKey("job_openings.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("stage_id", UUID, sa.ForeignKey("stages.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("resume_file_id", sa.String(255), nullable=True),
        sa.Column("resume_path", sa.String(500), nullable=True),
        sa.Column("resume_file_name", sa.String(255), nullable=True),
        sa.Column("cover_note", sa.Text, nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="careers_page"),
        sa.Column("rejection_reason", sa.String(255), nullable=True),
        sa.Column("rejection_note", sa.Text, nullable=True),
        sa.Column("converted_employee_id", UUID, sa.ForeignKey("employee.id", ondelete="SET NULL"), nullable=True, unique=True),
        *_ts(),
        sa.UniqueConstraint("candidate_id", "job_id", name="uq_application_candidate_job"),
    )

    # ── 5. application_activities table ───────────────────
    op.create_table(
        "application_activities",
        sa.Column("id", UUID, primary_key=True, default=uuid.uuid4),
        sa.Column("company_id", UUID, sa.ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("application_id", UUID, sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("actor_id", UUID, sa.ForeignKey("user_account.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_type", sa.String(30), nullable=False, server_default="user"),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("from_stage_id", UUID, sa.ForeignKey("stages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_stage_id", UUID, sa.ForeignKey("stages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metadata_json", sa.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── 6. Seed stages & roles for existing companies ─────
    bind = op.get_bind()
    companies = bind.execute(sa.text("SELECT id FROM company")).fetchall()

    default_stages = [
        ("Applied", "APPLIED", 1, True, False, None),
        ("Screening", "SCREENING", 2, False, False, None),
        ("Interview", "INTERVIEW", 3, False, False, None),
        ("Offer", "OFFER", 4, False, False, None),
        ("Hired", "HIRED", 5, False, True, "hired"),
        ("Rejected", "REJECTED", 6, False, True, "rejected"),
    ]

    ats_admin_perms = {
        "ats:job:manage": True,
        "ats:applicants:view": True,
        "ats:application:move_stage": True,
        "ats:application:reject": True,
        "ats:interview:assign": True,
        "ats:interview:view_own": True,
        "ats:feedback:submit": True,
        "ats:feedback:view_all": True,
        "ats:offer:manage": True,
        "ats:hire:convert": True,
        "ats:settings:manage": True,
    }

    recruiter_perms = {
        "employees:read": True,
        "ats:job:manage": True,
        "ats:applicants:view": True,
        "ats:application:move_stage": True,
        "ats:application:reject": True,
        "ats:interview:assign": True,
        "ats:interview:view_own": True,
    }

    interviewer_perms = {
        "ats:interview:view_own": True,
        "ats:feedback:submit": True,
    }

    import json

    for comp in companies:
        c_id = comp[0]
        # Seed stages
        for name, code, order, is_init, is_term, term_type in default_stages:
            bind.execute(
                sa.text("""
                    INSERT INTO stages (id, company_id, name, code, display_order, is_initial, is_terminal, terminal_type, is_active, created_at, updated_at)
                    VALUES (:id, :company_id, :name, :code, :display_order, :is_initial, :is_terminal, :terminal_type, true, NOW(), NOW())
                    ON CONFLICT (company_id, name) DO NOTHING
                """),
                {
                    "id": str(uuid.uuid4()),
                    "company_id": str(c_id),
                    "name": name,
                    "code": code,
                    "display_order": order,
                    "is_initial": is_init,
                    "is_terminal": is_term,
                    "terminal_type": term_type,
                }
            )

        # Update Admin role with ATS permissions
        admin_role = bind.execute(
            sa.text("SELECT id, permissions FROM role WHERE company_id = :company_id AND name = 'Admin'"),
            {"company_id": str(c_id)}
        ).fetchone()

        if admin_role:
            role_id, perms = admin_role[0], admin_role[1] or {}
            if isinstance(perms, str):
                try:
                    perms = json.loads(perms)
                except Exception:
                    perms = {}
            perms.update(ats_admin_perms)
            bind.execute(
                sa.text("UPDATE role SET permissions = :perms, updated_at = NOW() WHERE id = :id"),
                {"perms": json.dumps(perms), "id": str(role_id)}
            )

        # Create Recruiter role if not exists
        recruiter_exists = bind.execute(
            sa.text("SELECT id FROM role WHERE company_id = :company_id AND name = 'Recruiter'"),
            {"company_id": str(c_id)}
        ).fetchone()
        if not recruiter_exists:
            bind.execute(
                sa.text("""
                    INSERT INTO role (id, company_id, name, permissions, created_at, updated_at)
                    VALUES (:id, :company_id, 'Recruiter', :perms, NOW(), NOW())
                """),
                {
                    "id": str(uuid.uuid4()),
                    "company_id": str(c_id),
                    "perms": json.dumps(recruiter_perms),
                }
            )

        # Create Interviewer role if not exists
        interviewer_exists = bind.execute(
            sa.text("SELECT id FROM role WHERE company_id = :company_id AND name = 'Interviewer'"),
            {"company_id": str(c_id)}
        ).fetchone()
        if not interviewer_exists:
            bind.execute(
                sa.text("""
                    INSERT INTO role (id, company_id, name, permissions, created_at, updated_at)
                    VALUES (:id, :company_id, 'Interviewer', :perms, NOW(), NOW())
                """),
                {
                    "id": str(uuid.uuid4()),
                    "company_id": str(c_id),
                    "perms": json.dumps(interviewer_perms),
                }
            )


def downgrade() -> None:
    op.drop_table("application_activities")
    op.drop_table("applications")
    op.drop_table("candidates")
    op.drop_table("job_openings")
    op.drop_table("stages")
