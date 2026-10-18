"""Pydantic schemas for PMS configuration (config, parameters, slabs)."""

from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PmsConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cycle_frequency: str
    weight_goals: Decimal
    weight_competency: Decimal
    weight_discipline: Decimal
    weight_growth: Decimal
    weight_manager: Decimal
    weight_peer: Decimal
    weight_self: Decimal
    max_peer_weight: Decimal
    min_peer_responses: int
    trim_outliers: bool
    peer_anonymous: bool
    goal_achievement_cap: Decimal
    rating_scale_max: int
    min_tenure_days_for_hike: int


class PmsConfigUpdate(BaseModel):
    """Partial update; cross-field sums are validated in the service
    against the merged (existing + incoming) values."""
    cycle_frequency: Literal["annual", "half_yearly", "quarterly"] | None = None
    weight_goals: Decimal | None = Field(None, ge=0, le=100)
    weight_competency: Decimal | None = Field(None, ge=0, le=100)
    weight_discipline: Decimal | None = Field(None, ge=0, le=100)
    weight_growth: Decimal | None = Field(None, ge=0, le=100)
    weight_manager: Decimal | None = Field(None, ge=0, le=100)
    weight_peer: Decimal | None = Field(None, ge=0, le=100)
    weight_self: Decimal | None = Field(None, ge=0, le=100)
    max_peer_weight: Decimal | None = Field(None, ge=0, le=100)
    min_peer_responses: int | None = Field(None, ge=1, le=20)
    trim_outliers: bool | None = None
    peer_anonymous: bool | None = None
    goal_achievement_cap: Decimal | None = Field(None, ge=100, le=200)
    min_tenure_days_for_hike: int | None = Field(None, ge=0, le=3650)


class ParameterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    display_order: int = 0


class ParameterUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class ParameterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    display_order: int
    is_active: bool


class SlabBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    min_score: Decimal = Field(..., ge=0, le=5)
    max_score: Decimal = Field(..., gt=0, le=5)
    hike_percent: Decimal = Field(..., ge=0, le=100)

    @model_validator(mode="after")
    def _range(self):
        if self.max_score <= self.min_score:
            raise ValueError("max_score must be greater than min_score")
        return self


class SlabCreate(SlabBase):
    pass


class SlabOut(SlabBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID


# -- Cycles ---------------------------------------------------

from datetime import date, datetime  # noqa: E402
from typing import Any  # noqa: E402


class CycleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    start_date: date
    end_date: date
    goal_setting_deadline: date | None = None
    rating_start: date | None = None
    rating_end: date | None = None
    review_end: date | None = None

    @model_validator(mode="after")
    def _dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.rating_start and self.rating_end and self.rating_end < self.rating_start:
            raise ValueError("rating_end must be on or after rating_start")
        if self.rating_end and self.review_end and self.review_end < self.rating_end:
            raise ValueError("review_end must be on or after rating_end")
        return self


class CycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    start_date: date
    end_date: date
    goal_setting_deadline: date | None
    rating_start: date | None
    rating_end: date | None
    review_end: date | None
    status: str
    launched_at: datetime | None
    finalized_at: datetime | None


class ParticipantOut(BaseModel):
    """Phase 2 view: enrolment only. Scores are intentionally absent."""
    id: UUID
    employee_id: UUID
    employee_name: str | None
    manager_id: UUID | None
    department_id: UUID | None
    status: str


# -- Goals ----------------------------------------------------

GoalCategory = Literal["output", "kpi", "quality", "on_time"]
GoalDirection = Literal["higher_better", "lower_better"]


class GoalCreate(BaseModel):
    employee_id: UUID | None = None  # None = myself
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    category: GoalCategory = "output"
    weight: Decimal = Field(..., gt=0, le=100)
    target_value: Decimal = Field(Decimal("100"), gt=0)
    unit: str | None = Field(None, max_length=30)
    direction: GoalDirection = "higher_better"


class GoalUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    category: GoalCategory | None = None
    weight: Decimal | None = Field(None, gt=0, le=100)
    target_value: Decimal | None = Field(None, gt=0)
    unit: str | None = Field(None, max_length=30)
    direction: GoalDirection | None = None


class ProgressCreate(BaseModel):
    recorded_on: date | None = None
    actual_value: Decimal = Field(..., ge=0)
    note: str | None = None


class ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recorded_on: date
    actual_value: Decimal
    achievement_pct: Decimal
    note: str | None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cycle_id: UUID
    employee_id: UUID
    title: str
    description: str | None
    category: str
    weight: Decimal
    target_value: Decimal
    unit: str | None
    direction: str
    status: str
    final_achievement_pct: Decimal | None
    progress: list[ProgressOut] = []


class GoalsEmployeeRef(BaseModel):
    employee_id: UUID | None = None  # None = myself (submit only)


class GoalsReturn(BaseModel):
    employee_id: UUID
    reason: str = Field(..., min_length=1)


class GoalsApprove(BaseModel):
    employee_id: UUID


class KpiItem(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: GoalCategory = "kpi"
    weight: Decimal = Field(..., gt=0, le=100)
    target_value: Decimal = Field(..., gt=0)
    unit: str | None = None
    direction: GoalDirection = "higher_better"


class KpiTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    department_id: UUID | None = None
    designation_id: UUID | None = None
    items: list[KpiItem] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _sum(self):
        if sum(i.weight for i in self.items) != 100:
            raise ValueError("Template item weights must sum to 100")
        return self


class KpiTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    department_id: UUID | None
    designation_id: UUID | None
    items: list[dict[str, Any]]


class ApplyTemplate(BaseModel):
    template_id: UUID
    employee_id: UUID | None = None


# -- Ratings / assignments ------------------------------------
# NOTE: no schema here may ever carry rater identity for peer reviews.

class TaskOut(BaseModel):
    id: UUID
    cycle_id: UUID
    cycle_name: str
    ratee_id: UUID
    ratee_name: str
    rater_type: str
    status: str


class TaskParameter(BaseModel):
    id: str
    name: str
    display_order: int = 0


class TaskDetailOut(TaskOut):
    parameters: list[TaskParameter]


class RatingItem(BaseModel):
    parameter_id: UUID
    score: int = Field(..., ge=1, le=5)
    comment: str | None = Field(None, max_length=2000)


class SubmitRatings(BaseModel):
    ratings: list[RatingItem] = Field(..., min_length=1)


class ReviewerSet(BaseModel):
    reviewer_id: UUID


class CompletionOut(BaseModel):
    employee_id: UUID
    employee_name: str | None
    self_status: str
    manager_status: str
    peers_assigned: int
    peers_submitted: int


class ScoreOut(BaseModel):
    """Admin scoring view. Peer identities are never present."""
    employee_id: UUID
    employee_name: str | None
    status: str
    goals_score: Decimal | None
    competency_score: Decimal | None
    self_avg: Decimal | None
    manager_avg: Decimal | None
    peer_avg: Decimal | None
    peer_response_count: int
    peer_score_insufficient: bool
    final_score: Decimal | None
    final_rating_label: str | None
    parameter_breakdown: list[dict[str, Any]] | None


# -- Phase 4: Results, adjustments, history, audit ------------

class ScoreAdjustRequest(BaseModel):
    adjusted_score: Decimal = Field(..., ge=0, le=5)
    reason: str = Field(..., min_length=1, max_length=1000)


class ParticipantResultOut(BaseModel):
    """Result view for employee (after release), manager (team), or admin.
    Peer rater identities are never included."""
    employee_id: UUID
    employee_name: str | None
    status: str
    goals_score: Decimal | None
    competency_score: Decimal | None
    self_avg: Decimal | None
    manager_avg: Decimal | None
    peer_avg: Decimal | None
    peer_response_count: int
    peer_score_insufficient: bool
    final_score: Decimal | None
    adjusted_score: Decimal | None
    effective_score: Decimal | None
    adjustment_reason: str | None
    final_rating_label: str | None
    attendance_snapshot: dict[str, Any] | None
    parameter_breakdown: list[dict[str, Any]] | None
    locked_at: datetime | None
    released_at: datetime | None


class CompanyResultsOut(BaseModel):
    cycle_id: UUID
    cycle_name: str
    status: str
    participant_count: int
    average_score: Decimal | None
    distribution: dict[str, int]
    participants: list[ParticipantResultOut]


class HistoryEntryOut(BaseModel):
    cycle_id: UUID
    cycle_name: str
    start_date: date
    end_date: date
    goals_score: Decimal | None
    competency_score: Decimal | None
    effective_score: Decimal | None
    final_rating_label: str | None
    released_at: datetime | None


class PmsAuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cycle_id: UUID | None
    entity_type: str
    entity_id: UUID | None
    action: str
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    reason: str | None
    actor_employee_id: UUID | None
    created_at: datetime


# -- Phase 5: Payroll revisions -------------------------------

class PayrollRevisionOut(BaseModel):
    id: UUID
    cycle_id: UUID
    participant_id: UUID
    employee_id: UUID
    employee_name: str
    final_score: Decimal | None
    final_rating_label: str | None
    eligible: bool
    ineligible_reason: str | None
    current_basic_pay: Decimal | None
    current_annual_ctc: Decimal | None
    suggested_hike_percent: Decimal
    approved_hike_percent: Decimal | None
    override_reason: str | None
    new_basic_pay: Decimal | None
    new_annual_ctc: Decimal | None
    effective_date: date | None
    status: str
    approved_at: datetime | None
    salary_assignment_id: UUID | None


class PayrollRevisionApprove(BaseModel):
    approved_hike_percent: Decimal | None = Field(None, ge=0, le=100)
    effective_date: date | None = None
    override_reason: str | None = Field(None, max_length=1000)


class PayrollRevisionReject(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)
