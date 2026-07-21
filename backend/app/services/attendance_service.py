"""Attendance service — clock-in/out, regularization requests, summaries."""

from uuid import UUID
from datetime import datetime, timezone, date, timedelta
from collections import defaultdict
import calendar
from sqlalchemy.orm import Session

from app.models.attendance_record import AttendanceRecord
from app.models.attendance_regularization import AttendanceRegularization
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.attendance_regularization_repo import AttendanceRegularizationRepository
from app.services.audit_service import log_action


class AttendanceService:
    def __init__(self, db: Session, company_id: UUID):
        self.repo = AttendanceRepository(db, company_id)
        self.regularization_repo = AttendanceRegularizationRepository(db, company_id)
        self.db = db
        self.company_id = company_id

    def clock_in(
        self, employee_id: UUID, source: str = "web", location: str | None = None, summary: str | None = None
    ) -> AttendanceRecord:
        """Clock in — create a new open attendance record."""
        # Check for existing open record
        open_record = self.repo.get_open_record(employee_id)
        if open_record:
            raise ValueError("Employee already clocked in. Please clock out first.")

        record = AttendanceRecord(
            company_id=self.company_id,
            employee_id=employee_id,
            clock_in=datetime.now(timezone.utc),
            source=source,
            location=location,
            summary=summary,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def clock_out(self, employee_id: UUID, summary: str | None = None) -> AttendanceRecord:
        """Clock out — close the open attendance record."""
        record = self.repo.get_open_record(employee_id)
        if not record:
            raise ValueError("No open clock-in found.")

        now = datetime.now(timezone.utc)
        # Ensure clock_in is offset-aware for comparison
        clock_in_time = record.clock_in
        if clock_in_time.tzinfo is None:
            clock_in_time = clock_in_time.replace(tzinfo=timezone.utc)

        elapsed_seconds = (now - clock_in_time).total_seconds()
        min_required_seconds = 10 * 60  # 10 minutes

        if elapsed_seconds < min_required_seconds:
            remaining_seconds = int(min_required_seconds - elapsed_seconds)
            remaining_minutes = (remaining_seconds // 60) + 1
            raise ValueError(
                f"You must wait at least 10 minutes after clocking in before clocking out. Please wait ~{remaining_minutes} more minute(s)."
            )

        record.clock_out = now
        if summary:
            record.summary = summary
        self.db.commit()
        self.db.refresh(record)
        return record

    def get_records(self, employee_id: UUID | None = None, skip: int = 0, limit: int = 50):
        if employee_id:
            return self.repo.get_by_employee(employee_id, skip, limit)
        return self.repo.get_all(skip, limit)

    def get_by_date_range(self, start, end, employee_id=None):
        return self.repo.get_by_date_range(start, end, employee_id)

    def count_present_today(self) -> int:
        return self.repo.count_present_today()

    # ── Regularization requests ──────────────────────────
    def request_regularization(self, employee_id: UUID, data: dict) -> AttendanceRegularization:
        # Enforce Monthly Limit: Max 5 regularization requests per month
        req_date = data["record_date"]
        start_of_month = req_date.replace(day=1)
        # Next month start
        if req_date.month == 12:
            end_of_month = req_date.replace(year=req_date.year + 1, month=1, day=1)
        else:
            end_of_month = req_date.replace(month=req_date.month + 1, day=1)

        monthly_count = (
            self.db.query(AttendanceRegularization)
            .filter(
                AttendanceRegularization.company_id == self.company_id,
                AttendanceRegularization.employee_id == employee_id,
                AttendanceRegularization.record_date >= start_of_month,
                AttendanceRegularization.record_date < end_of_month,
                AttendanceRegularization.status.in_(["pending", "approved"]),
            )
            .count()
        )

        MAX_MONTHLY_LIMIT = 5
        if monthly_count >= MAX_MONTHLY_LIMIT:
            raise ValueError(f"Monthly regularization limit reached ({MAX_MONTHLY_LIMIT} requests per month allowed).")

        req = AttendanceRegularization(
            company_id=self.company_id,
            employee_id=employee_id,
            record_date=data["record_date"],
            requested_clock_in=data["requested_clock_in"],
            requested_clock_out=data.get("requested_clock_out"),
            reason=data["reason"],
            status="pending",
        )
        self.db.add(req)
        self.db.commit()
        self.db.refresh(req)
        return req

    def get_my_regularizations(self, employee_id: UUID, skip=0, limit=50):
        return self.regularization_repo.get_by_employee(employee_id, skip, limit)

    def get_pending_regularizations(self, skip=0, limit=50):
        return self.regularization_repo.get_pending(skip, limit)

    def count_pending_regularizations(self) -> int:
        return self.regularization_repo.count_pending()

    def approve_reject_regularization(
        self, request_id: UUID, status: str, reviewer_employee_id: UUID
    ) -> AttendanceRegularization | None:
        req = self.regularization_repo.get_by_id(request_id)
        if not req:
            return None
        if req.status != "pending":
            raise ValueError(f"Request is already {req.status}")

        req.status = status
        req.reviewed_by_employee_id = reviewer_employee_id

        if status == "approved":
            record = AttendanceRecord(
                company_id=self.company_id,
                employee_id=req.employee_id,
                clock_in=req.requested_clock_in,
                clock_out=req.requested_clock_out,
                source="regularization",
            )
            self.db.add(record)

        log_action(
            self.db, self.company_id, reviewer_employee_id,
            f"attendance_regularization.{status}", "attendance_regularization", req.id,
        )
        self.db.commit()
        self.db.refresh(req)
        return req

    # ── Timesheet (grouped daily view) ───────────────────
    def get_timesheet(self, year: int, month: int, employee_id: UUID) -> dict:
        """Return attendance records grouped by date for a given month."""
        _, last_day = calendar.monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, last_day)

        records = self.repo.get_by_date_range(start, end, employee_id)

        # Group records by date
        by_date: dict[date, list] = defaultdict(list)
        for rec in records:
            rec_date = rec.clock_in.date() if isinstance(rec.clock_in, datetime) else rec.clock_in
            by_date[rec_date].append(rec)

        days = []
        month_total_minutes = 0.0

        for d in sorted(by_date.keys()):
            sessions = []
            day_total_minutes = 0.0
            all_complete = True

            for rec in sorted(by_date[d], key=lambda r: r.clock_in):
                if rec.clock_out:
                    duration = (rec.clock_out - rec.clock_in).total_seconds() / 60.0
                else:
                    duration = None
                    all_complete = False

                sessions.append({
                    "clock_in": rec.clock_in,
                    "clock_out": rec.clock_out,
                    "duration_minutes": round(duration, 1) if duration is not None else None,
                    "source": rec.source,
                    "summary": rec.summary,
                })

                if duration is not None:
                    day_total_minutes += duration

            total_hours = round(day_total_minutes / 60.0, 2)
            month_total_minutes += day_total_minutes

            days.append({
                "date": d,
                "sessions": sessions,
                "total_hours": total_hours,
                "is_complete": all_complete,
            })

        return {
            "year": year,
            "month": month,
            "month_total_hours": round(month_total_minutes / 60.0, 2),
            "days": days,
        }

    # ── Employee overview (attendance + leave + holidays + overtime) ─────
    def get_employee_overview(self, employee_id: UUID, year: int, month: int) -> dict:
        """Full month view for one employee: attendance sessions, leave,
        holidays, and overtime merged per calendar day. Unlike get_timesheet
        (which only lists days that have attendance records), this walks
        every day of the month so leave/holiday days show up even with no
        clock-in — the single source of truth for both the self Timesheet
        tab and the Admin/Manager "Employee Records" lookup."""
        from app.repositories.leave_repo import LeaveRequestRepository
        from app.repositories.overtime_repo import OvertimeRepository
        from app.models.holiday_calendar import HolidayCalendar

        _, last_day = calendar.monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, last_day)

        records = self.repo.get_by_date_range(start, end, employee_id)
        by_date: dict[date, list] = defaultdict(list)
        for rec in records:
            rec_date = rec.clock_in.date() if isinstance(rec.clock_in, datetime) else rec.clock_in
            by_date[rec_date].append(rec)

        leave_requests = LeaveRequestRepository(self.db, self.company_id).get_by_employee_and_date_range(
            employee_id, start, end
        )
        leave_by_date: dict[date, dict] = {}
        for lr in leave_requests:
            d = max(lr.start_date, start)
            last = min(lr.end_date, end)
            while d <= last:
                leave_by_date[d] = {
                    "leave_type_name": lr.leave_type.name if lr.leave_type else None,
                    "status": lr.status,
                }
                d += timedelta(days=1)

        holidays = (
            self.db.query(HolidayCalendar)
            .filter(
                HolidayCalendar.company_id == self.company_id,
                HolidayCalendar.holiday_date >= start,
                HolidayCalendar.holiday_date <= end,
            )
            .all()
        )
        holiday_by_date = {h.holiday_date: h.name for h in holidays}

        overtime_requests = OvertimeRepository(self.db, self.company_id).get_by_employee_and_date_range(
            employee_id, start, end
        )
        overtime_by_date: dict[date, list] = defaultdict(list)
        for ot in overtime_requests:
            overtime_by_date[ot.request_date].append({
                "hours": float(ot.hours),
                "status": ot.status,
                "reason": ot.reason,
            })

        from app.repositories.shift_repo import EmployeeShiftRepository
        emp_shifts = EmployeeShiftRepository(self.db, self.company_id).get_by_employee(employee_id)
        active_shift = emp_shifts[0].shift if emp_shifts and emp_shifts[0].shift else None
        shift_start = active_shift.start_time if active_shift else None

        shift_info = None
        if active_shift:
            shift_info = {
                "shift_type": active_shift.shift_type,
                "start_time": active_shift.start_time.strftime("%H:%M") if active_shift.start_time else None,
                "end_time": active_shift.end_time.strftime("%H:%M") if active_shift.end_time else None,
            }

        days = []
        month_total_minutes = 0.0

        d = start
        while d <= end:
            sessions = []
            day_total_minutes = 0.0
            all_complete = True

            for rec in sorted(by_date.get(d, []), key=lambda r: r.clock_in):
                if rec.clock_out:
                    duration = (rec.clock_out - rec.clock_in).total_seconds() / 60.0
                else:
                    duration = None
                    all_complete = False

                # Convert UTC clock_in to local time (or target timezone) for accurate clock_in time matching
                # Assuming Indian Standard Time (+5:30) or local offset for comparison
                local_clock_in = rec.clock_in + timedelta(hours=5, minutes=30)
                rec_time = local_clock_in.time()
                rec_mins = rec_time.hour * 60 + rec_time.minute

                punctuality = "On Time"
                if shift_start:
                    shift_mins = shift_start.hour * 60 + shift_start.minute
                    if rec_mins > shift_mins + 15:
                        punctuality = "Late"
                    elif rec_mins < shift_mins - 15:
                        punctuality = "Early"
                else:
                    # Default shift threshold: 9:15 AM
                    if rec_mins > 9 * 60 + 15:
                        punctuality = "Late"

                sessions.append({
                    "clock_in": rec.clock_in,
                    "clock_out": rec.clock_out,
                    "duration_minutes": round(duration, 1) if duration is not None else None,
                    "source": rec.source,
                    "summary": rec.summary,
                    "punctuality_status": punctuality,
                })
                if duration is not None:
                    day_total_minutes += duration

            total_hours = round(day_total_minutes / 60.0, 2)
            month_total_minutes += day_total_minutes

            days.append({
                "date": d,
                "sessions": sessions,
                "total_hours": total_hours,
                "is_complete": all_complete if sessions else None,
                "leave": leave_by_date.get(d),
                "holiday": holiday_by_date.get(d),
                "overtime": overtime_by_date.get(d, []),
            })
            d += timedelta(days=1)

        return {
            "employee_id": str(employee_id),
            "year": year,
            "month": month,
            "month_total_hours": round(month_total_minutes / 60.0, 2),
            "shift_info": shift_info,
            "days": days,
        }
