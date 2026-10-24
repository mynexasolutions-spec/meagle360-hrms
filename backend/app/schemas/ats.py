"""
Pydantic Schemas for ATS Module.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


# ── Job Openings ─────────────────────────────────────────

class JobOpeningBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    department_id: UUID | None = None
    department_name: str | None = None
    designation_id: UUID | None = None
    designation_name: str | None = None
    number_of_openings: int = Field(default=1, ge=1)
    description: str | None = None
    responsibilities: str | None = None
    requirements: str | None = None
    location: str | None = None
    job_type: str = Field(default="Full-time")
    status: str = Field(default="Draft")
    experience_range: str | None = None


class JobOpeningCreate(JobOpeningBase):
    pass


class JobOpeningUpdate(BaseModel):
    title: str | None = None
    department_id: UUID | None = None
    department_name: str | None = None
    designation_id: UUID | None = None
    designation_name: str | None = None
    number_of_openings: int | None = None
    description: str | None = None
    responsibilities: str | None = None
    requirements: str | None = None
    location: str | None = None
    job_type: str | None = None
    status: str | None = None
    experience_range: str | None = None


class JobOpeningResponse(JobOpeningBase):
    id: UUID
    company_id: UUID
    created_at: datetime
    updated_at: datetime
    applicants_count: int = 0

    class Config:
        from_attributes = True





# ── Public Careers Page Schemas ──────────────────────────

class PublicJobSummary(BaseModel):
    id: UUID
    title: str
    department_name: str | None = None
    designation_name: str | None = None
    number_of_openings: int
    description: str | None = None
    responsibilities: str | None = None
    requirements: str | None = None
    location: str | None = None
    job_type: str
    experience_range: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True





class TenantCareersBranding(BaseModel):
    name: str
    subdomain: str
    logo_url: str | None = None
    tagline: str | None = "Join our team"
    open_jobs_count: int = 0


# ── Phase 2: Applicants & Stage Pipeline Schemas ──────────

class StageResponse(BaseModel):
    id: UUID
    name: str
    code: str | None = None
    display_order: int
    is_initial: bool
    is_terminal: bool
    terminal_type: str | None = None
    is_active: bool
    applicants_count: int = 0

    class Config:
        from_attributes = True





class StageChangeRequest(BaseModel):
    current_stage_id: UUID
    target_stage_id: UUID
    reason: str | None = None
    note: str | None = None


class AddNoteRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=2000)


class BulkShortlistRequest(BaseModel):
    application_ids: list[UUID]


# ── Phase 3: Interviews & ATS Settings Schemas ───────────

class RoundTemplateCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    display_order: int = 1


class RoundTemplateResponse(BaseModel):
    id: UUID
    name: str
    display_order: int
    is_active: bool

    class Config:
        from_attributes = True





class RejectionReasonResponse(BaseModel):
    id: UUID
    reason: str
    is_active: bool

    class Config:
        from_attributes = True





class CreateInterviewRequest(BaseModel):
    application_id: UUID
    round_template_id: UUID | None = None
    round_name: str
    round_number: int = 1
    interview_type: str = "Virtual"


class AssignInterviewerRequest(BaseModel):
    interviewer_employee_id: UUID


class SetSlotRequest(BaseModel):
    scheduled_at: datetime
    duration_minutes: int = 45
    meeting_link_or_location: str | None = None
    interview_type: str | None = None


class SubmitFeedbackRequest(BaseModel):
    attended: bool = True
    rating: int | None = None
    recommendation: str | None = None
    notes: str | None = None


# ── Phase 4: Offer and Hired Schemas ─────────────────────

class CreateOfferRequest(BaseModel):
    designation: str = Field(..., min_length=2, max_length=255)
    ctc: Decimal = Field(..., gt=0)
    joining_date: date
    reporting_manager_id: UUID | None = None
    probation_period_months: int = Field(default=3, ge=0, le=24)
    validity_date: date | None = None
    offer_letter_template: str | None = None
    notes: str | None = None


class UpdateOfferStatusRequest(BaseModel):
    status: str = Field(..., description="Draft, Approved, Sent, Accepted, Declined, Expired, Withdrawn")
    declined_reason: str | None = None
    notes: str | None = None


class OfferResponse(BaseModel):
    id: UUID
    company_id: UUID
    application_id: UUID
    version_number: int
    designation: str
    ctc: Decimal
    joining_date: date
    reporting_manager_id: UUID | None = None
    reporting_manager_name: str | None = None
    probation_period_months: int
    validity_date: date | None = None
    status: str
    offer_letter_template: str | None = None
    declined_reason: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True





class ConvertToEmployeeRequest(BaseModel):
    employee_code: str | None = None
    department_id: UUID | None = None
    designation_id: UUID | None = None
    site_id: UUID | None = None
    manager_id: UUID | None = None
    date_of_hire: date | None = None
    create_user_account: bool = True
    role_id: UUID | None = None


# ── Careers Page Settings ────────────────────────────────

class CareersSettingsUpdate(BaseModel):
    brand_name: str | None = None
    logo_url: str | None = None
    badge_text: str | None = None
    title_prefix: str | None = None
    title_highlight: str | None = None
    subtitle: str | None = None
    hero_image_url: str | None = None
    hero_card_badge: str | None = None
    hero_card_quote: str | None = None
    primary_color: str | None = None


class CareersSettingsResponse(BaseModel):
    id: UUID
    company_id: UUID
    brand_name: str | None = None
    logo_url: str | None = None
    badge_text: str
    title_prefix: str
    title_highlight: str
    subtitle: str | None = None
    hero_image_url: str | None = None
    hero_card_badge: str
    hero_card_quote: str
    primary_color: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpdateHiringTeamRoleRequest(BaseModel):
    is_recruiter: bool = False
    is_interviewer: bool = False





