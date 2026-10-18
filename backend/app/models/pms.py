"""PMS (Performance Management System) models.

Tables: pms_config, competency_parameter, review_cycle, review_participant,
review_assignment, rating, goal, goal_progress, kpi_template, rating_slab,
payroll_revision, pms_audit_log.

Privacy rule: Rating/ReviewAssignment store rater_id for audit purposes
only. No API response schema may ever expose it to an employee.
"""

import uuid
from datetime import date as date_type, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric,
    SmallInteger, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _company_fk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )


def _employee_fk(nullable: bool = False, ondelete: str = "CASCADE", index: bool = True):
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete=ondelete),
        nullable=nullable, index=index,
    )


# ── Config ───────────────────────────────────────────────────

class PmsConfig(Base, TimestampMixin):
    """One row per company: weights, peer rules, cycle frequency."""
    __tablename__ = "pms_config"
    __table_args__ = (
        CheckConstraint(
            "weight_goals + weight_competency + weight_discipline + weight_growth = 100",
            name="ck_pms_config_pillar_weights_100",
        ),
        CheckConstraint(
            "weight_manager + weight_peer + weight_self = 100",
            name="ck_pms_config_rater_weights_100",
        ),
        CheckConstraint("min_peer_responses >= 1", name="ck_pms_config_min_peer_resp"),
        CheckConstraint("max_peer_weight BETWEEN 0 AND 100", name="ck_pms_config_max_peer_weight"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    cycle_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="annual")  # annual|half_yearly|quarterly

    # Pillar weights (sum = 100)
    weight_goals: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=50)
    weight_competency: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=30)
    weight_discipline: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=10)
    weight_growth: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=10)

    # Rater weights inside Competency (sum = 100)
    weight_manager: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=50)
    weight_peer: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=30)
    weight_self: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=20)
    max_peer_weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=30)

    min_peer_responses: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    trim_outliers: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    peer_anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    goal_achievement_cap: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=120)
    rating_scale_max: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=5)
    min_tenure_days_for_hike: Mapped[int] = mapped_column(Integer, nullable=False, default=180)


class CompetencyParameter(Base, TimestampMixin):
    __tablename__ = "competency_parameter"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_competency_parameter_company_name"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class RatingSlab(Base, TimestampMixin):
    """score range [min_score, max_score) -> hike percent."""
    __tablename__ = "rating_slab"
    __table_args__ = (
        CheckConstraint("min_score >= 0 AND max_score > min_score", name="ck_rating_slab_range"),
        CheckConstraint("hike_percent >= 0", name="ck_rating_slab_hike_nonneg"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    min_score: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    max_score: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    hike_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)


class KpiTemplate(Base, TimestampMixin):
    __tablename__ = "kpi_template"

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("department.id", ondelete="SET NULL"), nullable=True)
    designation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("designation.id", ondelete="SET NULL"), nullable=True)
    # [{title, category, weight, target_value, unit, direction}]
    items: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


# ── Cycle ────────────────────────────────────────────────────

CYCLE_STATUSES = (
    "draft", "goal_setting", "rating", "review",
    "finalized", "released", "payroll_approved", "closed",
)


class ReviewCycle(Base, TimestampMixin):
    __tablename__ = "review_cycle"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_review_cycle_dates"),
        CheckConstraint(
            "status IN ('draft','goal_setting','rating','review','finalized',"
            "'released','payroll_approved','closed')",
            name="ck_review_cycle_status",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    start_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    end_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    goal_setting_deadline: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    rating_start: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    rating_end: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    review_end: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    # Frozen copy of pms_config + rating_slab + parameters at launch so later
    # config edits cannot change an in-flight/finalized cycle's results.
    config_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)

    participants = relationship(
        "ReviewParticipant", back_populates="cycle", cascade="all, delete-orphan")


class ReviewParticipant(Base, TimestampMixin):
    """An employee enrolled in a cycle, plus their computed result."""
    __tablename__ = "review_participant"
    __table_args__ = (
        UniqueConstraint("cycle_id", "employee_id", name="uq_review_participant_cycle_employee"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_cycle.id", ondelete="CASCADE"),
        nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = _employee_fk()
    # Snapshots at launch
    manager_id: Mapped[uuid.UUID | None] = _employee_fk(nullable=True, ondelete="SET NULL")
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("department.id", ondelete="SET NULL"), nullable=True)
    designation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("designation.id", ondelete="SET NULL"), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending|in_progress|submitted|finalized

    goals_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    competency_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    discipline_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    growth_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    self_avg: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    manager_avg: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    peer_avg: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    peer_response_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    peer_score_insufficient: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    final_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    final_rating_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Manager/HR review-window override
    adjusted_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    adjustment_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    attendance_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    parameter_breakdown: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # per-parameter self/manager/peer + gap

    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cycle = relationship("ReviewCycle", back_populates="participants")
    employee = relationship("Employee", foreign_keys=[employee_id])


class ReviewAssignment(Base, TimestampMixin):
    """Who rates whom. rater_id is NEVER exposed to the ratee."""
    __tablename__ = "review_assignment"
    __table_args__ = (
        UniqueConstraint("cycle_id", "ratee_id", "rater_id", name="uq_review_assignment_trio"),
        CheckConstraint("rater_type IN ('self','manager','peer')", name="ck_review_assignment_type"),
        CheckConstraint(
            "(rater_type = 'self') = (rater_id = ratee_id)", name="ck_review_assignment_self"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_cycle.id", ondelete="CASCADE"),
        nullable=False, index=True)
    ratee_id: Mapped[uuid.UUID] = _employee_fk()
    rater_id: Mapped[uuid.UUID] = _employee_fk()
    rater_type: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="pending")  # pending|submitted|declined
    assigned_by: Mapped[str] = mapped_column(String(10), nullable=False, default="system")  # system|manager|admin
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    ratings = relationship("Rating", back_populates="assignment", cascade="all, delete-orphan")


class Rating(Base, TimestampMixin):
    __tablename__ = "rating"
    __table_args__ = (
        UniqueConstraint("assignment_id", "parameter_id", name="uq_rating_assignment_parameter"),
        CheckConstraint("score BETWEEN 1 AND 5", name="ck_rating_score_1_5"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_assignment.id", ondelete="CASCADE"),
        nullable=False, index=True)
    parameter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("competency_parameter.id", ondelete="CASCADE"), nullable=False)
    # Denormalized so aggregation never needs to join rater identity
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_cycle.id", ondelete="CASCADE"),
        nullable=False, index=True)
    ratee_id: Mapped[uuid.UUID] = _employee_fk()
    rater_type: Mapped[str] = mapped_column(String(10), nullable=False)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    assignment = relationship("ReviewAssignment", back_populates="ratings")


# ── Goals ────────────────────────────────────────────────────

class Goal(Base, TimestampMixin):
    __tablename__ = "goal"
    __table_args__ = (
        CheckConstraint("weight > 0 AND weight <= 100", name="ck_goal_weight"),
        CheckConstraint("direction IN ('higher_better','lower_better')", name="ck_goal_direction"),
        CheckConstraint(
            "status IN ('draft','pending_approval','approved','locked')", name="ck_goal_status"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_cycle.id", ondelete="CASCADE"),
        nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = _employee_fk()
    kpi_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kpi_template.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="output")  # output|kpi|quality|on_time
    weight: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    target_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=100)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    direction: Mapped[str] = mapped_column(String(15), nullable=False, default="higher_better")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)
    final_achievement_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)

    progress = relationship(
        "GoalProgress", back_populates="goal", cascade="all, delete-orphan",
        order_by="GoalProgress.recorded_on")


class GoalProgress(Base, TimestampMixin):
    __tablename__ = "goal_progress"

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goal.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    actual_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    achievement_pct: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)

    goal = relationship("Goal", back_populates="progress")


# ── Payroll linkage ──────────────────────────────────────────

class PayrollRevision(Base, TimestampMixin):
    """Hike derived from a PMS result. Never auto-applied: suggested ->
    approved (admin) -> applied (explicit step creating a new
    EmployeeSalaryAssignment row; old history untouched)."""
    __tablename__ = "payroll_revision"
    __table_args__ = (
        CheckConstraint(
            "status IN ('suggested','approved','rejected','applied')",
            name="ck_payroll_revision_status"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_participant.id", ondelete="CASCADE"),
        nullable=False, unique=True)
    cycle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_cycle.id", ondelete="CASCADE"),
        nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = _employee_fk()
    current_basic_pay: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    current_annual_ctc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    suggested_hike_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    approved_hike_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_basic_pay: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    new_annual_ctc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    effective_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="suggested")
    eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ineligible_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    salary_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee_salary_assignment.id", ondelete="SET NULL"),
        nullable=True)


# ── Audit ────────────────────────────────────────────────────

class PmsAuditLog(Base):
    """Append-only. Repo/service layer must never update or delete rows."""
    __tablename__ = "pms_audit_log"

    id: Mapped[uuid.UUID] = _uuid_pk()
    company_id: Mapped[uuid.UUID] = _company_fk()
    cycle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("review_cycle.id", ondelete="CASCADE"),
        nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    old_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
