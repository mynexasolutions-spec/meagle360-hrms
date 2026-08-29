"""Pydantic schemas for OfferLetterRecord."""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class OfferLetterCreate(BaseModel):
    candidate_name: str
    candidate_address: str | None = None
    designation_id: UUID | None = None
    department_id: UUID | None = None
    reporting_to_id: UUID | None = None
    site_id: UUID | None = None
    start_date: date
    end_date: date | None = None
    employment_type: str = "full_time"
    salary_amount: Decimal | None = None
    salary_frequency: str | None = None
    bonus_details: str | None = None
    other_benefits: str | None = None
    acceptance_deadline: date | None = None
    hr_contact_name: str | None = None
    hr_contact_email: str | None = None


class OfferLetterResponse(BaseModel):
    id: UUID
    company_id: UUID
    candidate_name: str
    start_date: date
    end_date: date | None
    employment_type: str
    created_at: datetime

    class Config:
        from_attributes = True
