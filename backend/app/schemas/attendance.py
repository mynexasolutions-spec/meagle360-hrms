"""Pydantic schemas for Attendance."""

from uuid import UUID
from datetime import datetime, date
from pydantic import BaseModel


class ClockInRequest(BaseModel):
    source: str = "web"
    location: str | None = None


class ClockOutRequest(BaseModel):
    pass


class AttendanceRecordResponse(BaseModel):
    id: UUID
    employee_id: UUID
    clock_in: datetime
    clock_out: datetime | None
    source: str
    location: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class AttendanceSummary(BaseModel):
    date: date
    total_employees: int
    present: int
    absent: int
    late: int


class HolidayCalendarCreate(BaseModel):
    holiday_date: date
    name: str


class TimesheetSession(BaseModel):
    clock_in: datetime
    clock_out: datetime | None
    duration_minutes: float | None
    source: str


class TimesheetDay(BaseModel):
    date: date
    sessions: list[TimesheetSession]
    total_hours: float
    is_complete: bool


class TimesheetResponse(BaseModel):
    year: int
    month: int
    month_total_hours: float
    days: list[TimesheetDay]


class HolidayCalendarResponse(BaseModel):
    id: UUID
    company_id: UUID
    holiday_date: date
    name: str
    created_at: datetime

    class Config:
        from_attributes = True
