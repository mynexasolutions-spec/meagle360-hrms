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
    review_opens_days: int
    review_due_day: int


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
    review_opens_days: int | None = Field(None, ge=1, le=31)
    review_due_day: int | None = Field(None, ge=1, le=28)


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


# -- Goals ----------------------------------------------------

GoalDirection = Literal["higher_better", "lower_better"]


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
