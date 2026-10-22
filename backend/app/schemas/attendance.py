"""Pydantic schemas for Attendance."""

from uuid import UUID
from datetime import datetime, date
from pydantic import BaseModel


class ClockInRequest(BaseModel):
    source: str = "web"
    location: str | None = None
    summary: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    accuracy_m: float | None = None
    # Selfie verification: base64 live capture (never stored) and whether the
    # on-device liveness challenge (blink / head turn) was completed.
    selfie: str | None = None
    liveness_passed: bool = False


class ClockOutRequest(BaseModel):
    summary: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class AttendanceRecordResponse(BaseModel):
    id: UUID
    employee_id: UUID
    clock_in: datetime
    clock_out: datetime | None
    source: str
    location: str | None
    summary: str | None = None
    created_at: datetime
    latitude: float | None = None
    longitude: float | None = None
    accuracy_m: float | None = None
    distance_m: float | None = None
    geofence_status: str | None = None
    geofence_location_name: str | None = None
    geofence_review_status: str | None = None
    face_status: str | None = None
    face_review_status: str | None = None

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


class HolidayCalendarUpdate(BaseModel):
    holiday_date: date | None = None
    name: str | None = None


class TimesheetSession(BaseModel):
    clock_in: datetime
    clock_out: datetime | None
    duration_minutes: float | None
    source: str
    summary: str | None = None


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
