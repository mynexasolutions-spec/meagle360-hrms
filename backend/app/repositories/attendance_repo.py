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
        # `start`/`end` are IST-local calendar dates; clock_in is stored in
        # UTC, so the query bounds must shift by the IST offset first — a
        # UTC midnight boundary would clip records near either edge of the
        # range (e.g. a 4 AM IST clock-in is still "yesterday" in UTC).
        from datetime import datetime, time, timezone, timedelta
        ist_offset = timedelta(hours=5, minutes=30)
        start_dt = (datetime.combine(start, time.min) - ist_offset).replace(tzinfo=timezone.utc)
        end_dt = (datetime.combine(end, time.max) - ist_offset).replace(tzinfo=timezone.utc)

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

    def count_present_today(self) -> int:
        # Company operates in IST — clock_in is stored in UTC, so a clock-in
        # at 4 AM IST is still "yesterday" in UTC. date.today()'s UTC
        # midnight boundaries would miss it; shift by the IST offset first.
        ist_offset = timedelta(hours=5, minutes=30)
        now_utc = datetime.now(timezone.utc)
        today_local = (now_utc + ist_offset).date()
        start_dt = (datetime.combine(today_local, datetime.min.time()) - ist_offset).replace(tzinfo=timezone.utc)
        end_dt = start_dt + timedelta(days=1) - timedelta(microseconds=1)

        return (
            self._scoped_query()
            .filter(
                AttendanceRecord.clock_in >= start_dt,
                AttendanceRecord.clock_in <= end_dt
            )
            .distinct(AttendanceRecord.employee_id)
            .count()
        )
