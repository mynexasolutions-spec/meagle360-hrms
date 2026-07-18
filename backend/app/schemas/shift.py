"""Pydantic schemas for Shift management."""

from uuid import UUID
from datetime import time, date, datetime
from pydantic import BaseModel


class ShiftCreate(BaseModel):
    shift_type: str
    start_time: time
    end_time: time


class ShiftUpdate(BaseModel):
    shift_type: str | None = None
    start_time: time | None = None
    end_time: time | None = None


class ShiftResponse(BaseModel):
    id: UUID
    company_id: UUID
    shift_type: str
    start_time: time
    end_time: time
    created_at: datetime

    class Config:
        from_attributes = True


class EmployeeShiftAssign(BaseModel):
    employee_id: UUID
    shift_id: UUID
    effective_from: date


class EmployeeShiftResponse(BaseModel):
    id: UUID
    employee_id: UUID
    shift_id: UUID
    effective_from: date
    employee_name: str | None = None
    shift_type: str | None = None

    class Config:
        from_attributes = True
