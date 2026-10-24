"""
ATS (Applicant Tracking System) Models for Meagle360 HRMS.

Adheres strictly to the ATS phase-wise specification:
1. Candidate and application are separate (Candidate unique by email within tenant;
   unique constraint on candidate_id + job_id on Application).
2. Stage lives on Application. Stages are dynamic rows with is_initial and is_terminal flags.
3. Activity log is append-only with JSONB metadata snapshotting round/stage names.
4. Resumes store private ImageKit file_id and path (never full public URL).
5. Application has converted_employee_id for idempotent conversion in Phase 4.
"""

from datetime import date, datetime, timezone
import uuid
from decimal import Decimal
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Stage(Base, TimestampMixin):
    """
    Hiring pipeline stage (dynamic rows per tenant, never hardcoded).
    Default stages: Applied -> Screening -> Interview -> Offer -> Hired, plus Rejected.
    """
    __tablename__ = "stages"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_stage_company_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_initial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_terminal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # terminal_type: "hired" / "rejected" / None
    terminal_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    applications = relationship("Application", back_populates="stage")


class JobOpening(Base, TimestampMixin):
    """
    Job opening record.
    Status: Draft / Open / Closed.
    """
    __tablename__ = "job_openings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("department.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    department_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    designation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("designation.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    designation_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    number_of_openings: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsibilities: Mapped[str | None] = mapped_column(Text, nullable=True)
    requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # job_type: "Full-time", "Part-time", "Contract", "Internship", "Remote"
    job_type: Mapped[str] = mapped_column(String(50), nullable=False, default="Full-time")
    # status: Draft / Open / Closed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Draft", index=True)
    experience_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_account.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    department = relationship("Department")
    designation = relationship("Designation")
    created_by = relationship("UserAccount")
    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")


class Candidate(Base, TimestampMixin):
    """
    Candidate entity — separate from application.
    A candidate is unique by email within a tenant and can apply to multiple jobs.
    """
    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint("company_id", "email", name="uq_candidate_company_email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    years_of_experience: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    applications = relationship("Application", back_populates="candidate", cascade="all, delete-orphan")


class Application(Base, TimestampMixin):
    """
    Application entity — binds Candidate to a JobOpening in a specific Stage.
    Enforces candidate_id + job_id uniqueness per tenant.
    """
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("candidate_id", "job_id", name="uq_application_candidate_job"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("job_openings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stages.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Resume stored as private ImageKit file (id + path only, never public URL)
    resume_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resume_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resume_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    cover_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="careers_page")

    rejection_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rejection_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Phase 4 idempotent conversion reference
    converted_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    candidate = relationship("Candidate", back_populates="applications")
    job = relationship("JobOpening", back_populates="applications")
    stage = relationship("Stage", back_populates="applications")
    converted_employee = relationship("Employee")
    activities = relationship(
        "ApplicationActivity",
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="ApplicationActivity.created_at.desc()",
    )
    offers = relationship(
        "Offer",
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="Offer.version_number.desc()",
    )


class ApplicationActivity(Base):
    """
    Append-only audit log for applications.
    Records actor, event type, stage transitions, and JSONB metadata snapshot.
    """
    __tablename__ = "application_activities"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_account.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_type: Mapped[str] = mapped_column(String(30), nullable=False, default="user")
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    from_stage_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stages.id", ondelete="SET NULL"),
        nullable=True,
    )
    to_stage_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stages.id", ondelete="SET NULL"),
        nullable=True,
    )
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    application = relationship("Application", back_populates="activities")
    actor = relationship("UserAccount")
    from_stage = relationship("Stage", foreign_keys=[from_stage_id])
    to_stage = relationship("Stage", foreign_keys=[to_stage_id])



# ── Phase 3: Interviews & ATS Settings Models ─────────────

class InterviewRoundTemplate(Base, TimestampMixin):
    """Admin-configurable interview round templates (Technical, HR, Managerial)."""
    __tablename__ = "interview_round_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company = relationship("Company")


class RejectionReason(Base, TimestampMixin):
    """Admin-configurable list of candidate rejection reasons."""
    __tablename__ = "rejection_reasons"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    company = relationship("Company")


class Interview(Base, TimestampMixin):
    """
    Interview record for an application.
    Status chain: Needs interviewer -> Assigned -> Confirmed -> Completed / Absent / Cancelled.
    """
    __tablename__ = "interviews"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    round_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interview_round_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    round_name: Mapped[str] = mapped_column(String(100), nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    interview_type: Mapped[str] = mapped_column(String(50), nullable=False, default="video")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    meeting_link_or_location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Needs interviewer", index=True)

    application = relationship("Application")
    panel = relationship("InterviewPanel", back_populates="interview", cascade="all, delete-orphan")
    feedback_list = relationship("InterviewFeedback", back_populates="interview", cascade="all, delete-orphan")


class InterviewPanel(Base, TimestampMixin):
    """Interview panel join table — links interview to interviewer employee."""
    __tablename__ = "interview_panel"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    interview_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    interview = relationship("Interview", back_populates="panel")
    employee = relationship("Employee")


class InterviewFeedback(Base, TimestampMixin):
    """Interviewer feedback submission."""
    __tablename__ = "interview_feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    interview_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    interviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    interview = relationship("Interview", back_populates="feedback_list")
    interviewer = relationship("Employee")


class Offer(Base, TimestampMixin):
    """
    Candidate offer record with versioning support (e.g. renegotiations).
    Tracks status: Draft -> Approved -> Sent -> Accepted / Declined / Expired / Withdrawn.
    Generates browser-print ready offer letters.
    """
    __tablename__ = "offers"
    __table_args__ = (
        UniqueConstraint("application_id", "version_number", name="uq_offer_app_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    designation: Mapped[str] = mapped_column(String(255), nullable=False)
    ctc: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    joining_date: Mapped[date] = mapped_column(Date, nullable=False)
    reporting_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="SET NULL"),
        nullable=True,
    )
    probation_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    validity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Draft")
    # Draft | Approved | Sent | Accepted | Declined | Expired | Withdrawn
    offer_letter_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    declined_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    application = relationship("Application", back_populates="offers")
    reporting_manager = relationship("Employee", foreign_keys=[reporting_manager_id])


class CareersPageSettings(Base, TimestampMixin):
    """
    White-label customization settings for the public careers page.
    Allows tenant Admin to customize logo, brand name, hero title, subtitle,
    hero image, quotes, badge text, and brand colors.
    """
    __tablename__ = "careers_page_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    brand_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    badge_text: Mapped[str] = mapped_column(String(100), nullable=False, default="CAREERS")
    title_prefix: Mapped[str] = mapped_column(String(255), nullable=False, default="Join our")
    title_highlight: Mapped[str] = mapped_column(String(255), nullable=False, default="team")
    subtitle: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        default="Build amazing products, work with great people, and grow your career with us.",
    )
    hero_image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        default="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80",
    )
    hero_card_badge: Mapped[str] = mapped_column(String(100), nullable=False, default="Better Together")
    hero_card_quote: Mapped[str] = mapped_column(String(255), nullable=False, default="Better Code.\nBigger Dreams.")
    primary_color: Mapped[str] = mapped_column(String(50), nullable=False, default="#1d68f5")

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
