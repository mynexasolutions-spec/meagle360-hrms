"""Attendance repository with date-range and summary queries."""

from uuid import UUID
from datetime import date, datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.attendance_record import AttendanceRecord
from app.repositories.base import BaseRepository


class AttendanceRepository(BaseRepository[AttendanceRecord]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(AttendanceRecord, db, company_id)

    def get_by_employee(
        self, employee_id: UUID, skip: int = 0, limit: int = 50
    ) -> list[AttendanceRecord]:
        return (
            self._scoped_query()
            .filter(AttendanceRecord.employee_id == employee_id)
            .order_by(AttendanceRecord.clock_in.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_date_range(
        self, start: date, end: date, employee_id: UUID | None = None
    ) -> list[AttendanceRecord]:
        from datetime import datetime, time, timezone
        start_dt = datetime.combine(start, time.min).replace(tzinfo=timezone.utc)
        end_dt = datetime.combine(end, time.max).replace(tzinfo=timezone.utc)
        
        q = self._scoped_query().filter(
            AttendanceRecord.clock_in >= start_dt,
            AttendanceRecord.clock_in <= end_dt,
        )
        if employee_id:
            q = q.filter(AttendanceRecord.employee_id == employee_id)
        return q.order_by(AttendanceRecord.clock_in.desc()).all()

    def get_open_record(self, employee_id: UUID) -> AttendanceRecord | None:
        """Find an open (not clocked-out) attendance record."""
        return (
            self._scoped_query()
            .filter(
                AttendanceRecord.employee_id == employee_id,
                AttendanceRecord.clock_out.is_(None),
            )
            .first()
        )

    def get_open_records(self) -> list[AttendanceRecord]:
        """All currently-open (not clocked-out) records company-wide — used
        to derive who's online right now."""
        return (
            self._scoped_query()
            .filter(AttendanceRecord.clock_out.is_(None))
            .all()
        )

    def count_present_today(self) -> int:
        from datetime import datetime, time, timezone, date
        today = date.today()
        start_dt = datetime.combine(today, time.min).replace(tzinfo=timezone.utc)
        end_dt = datetime.combine(today, time.max).replace(tzinfo=timezone.utc)
        
        return (
            self._scoped_query()
            .filter(
                AttendanceRecord.clock_in >= start_dt,
                AttendanceRecord.clock_in <= end_dt
            )
            .distinct(AttendanceRecord.employee_id)
            .count()
        )
