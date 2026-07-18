"""Pydantic schemas for attendance regularization requests."""

from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel


class RegularizationCreate(BaseModel):
    record_date: date
    requested_clock_in: datetime
    requested_clock_out: datetime | None = None
    reason: str


class RegularizationApproval(BaseModel):
    status: str  # approved | rejected


class RegularizationResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    record_date: date
    requested_clock_in: datetime
    requested_clock_out: datetime | None
    reason: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
