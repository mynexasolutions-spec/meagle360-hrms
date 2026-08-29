"""Pydantic schemas for RelievingLetterRecord."""

from uuid import UUID
from datetime import date, datetime
from pydantic import BaseModel


class RelievingLetterCreate(BaseModel):
    employee_id: UUID
    last_working_date: date
    custom_paragraph: str | None = None


class RelievingLetterResponse(BaseModel):
    id: UUID
    company_id: UUID
    employee_id: UUID
    last_working_date: date
    custom_paragraph: str | None
    created_at: datetime

    class Config:
        from_attributes = True
