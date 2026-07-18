"""Pydantic schemas for overtime requests."""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class OvertimeCreate(BaseModel):
    request_date: date
    hours: Decimal
    reason: str


class OvertimeApproval(BaseModel):
    status: str  # approved | rejected


class OvertimeResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    request_date: date
    hours: Decimal
    reason: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
