"""Attendance repository with date-range and summary queries."""

from uuid import UUID
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.attendance_record import AttendanceRecord
from app.repositories.base import BaseRepository

# A record still open past this many hours is treated as an abandoned/missed
# clock-out rather than a real ongoing session — it's excluded from "am I
# clocked in" checks so it can never block a future Clock In, but it's left
# untouched in the data (no fabricated clock_out) so its history honestly
# shows no clock-out time rather than an invented one.
STALE_SESSION_HOURS = 16


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
        """Find a *recent* open (not clocked-out) attendance record — one
        started within STALE_SESSION_HOURS. An older open record is a missed
        clock-out, not a real ongoing session, so it's ignored here rather
        than blocking a fresh Clock In; it stays in history as-is (no
        clock-out time recorded) and can be corrected via Regularization."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=STALE_SESSION_HOURS)
        return (
            self._scoped_query()
            .filter(
                AttendanceRecord.employee_id == employee_id,
                AttendanceRecord.clock_out.is_(None),
                AttendanceRecord.clock_in >= cutoff,
            )
            .first()
        )

    def get_last_closed_record(self, employee_id: UUID) -> AttendanceRecord | None:
        """Most recent clocked-out record for an employee — used to enforce
        a short cooldown before they can clock in again."""
        return (
            self._scoped_query()
            .filter(
                AttendanceRecord.employee_id == employee_id,
                AttendanceRecord.clock_out.isnot(None),
            )
            .order_by(AttendanceRecord.clock_out.desc())
            .first()
        )

    def get_open_records(self) -> list[AttendanceRecord]:
        """All currently-open (not clocked-out) *recent* records company-wide
        — used to derive who's online right now. Same staleness cutoff as
        get_open_record so a forgotten clock-out from days ago doesn't show
        someone as perpetually "online"."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=STALE_SESSION_HOURS)
        return (
            self._scoped_query()
            .filter(AttendanceRecord.clock_out.is_(None), AttendanceRecord.clock_in >= cutoff)
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
