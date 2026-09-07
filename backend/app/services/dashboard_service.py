"""Dashboard aggregation service — summary stats and chart data."""

from uuid import UUID
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import Session

from sqlalchemy.orm import joinedload

from app.models.employee import Employee
from app.models.attendance_record import AttendanceRecord
from app.models.leave_request import LeaveRequest
from app.models.leave_type import LeaveType
from app.repositories.employee_repo import EmployeeRepository
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.leave_repo import LeaveRequestRepository

# Company operates in IST — "today" for attendance purposes means the local
# calendar day, not the UTC one. clock_in is stored in UTC, so a clock-in at
# 4 AM IST is still "yesterday" in UTC; comparing against date.today()'s UTC
# midnight boundaries directly would miss it. Same IST offset already used
# for punctuality in attendance_service.py.
_IST_OFFSET = timedelta(hours=5, minutes=30)


def _today_utc_bounds() -> tuple:
    """UTC [start, end] datetime bounds for "today" in IST."""
    from datetime import datetime, time, timezone
    now_utc = datetime.now(timezone.utc)
    today_local = (now_utc + _IST_OFFSET).date()
    start_local = datetime.combine(today_local, time.min)
    start_dt = (start_local - _IST_OFFSET).replace(tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(days=1) - timedelta(microseconds=1)
    return start_dt, end_dt


class DashboardService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def _count_on_leave(self, on_date: date) -> int:
        return (
            self.db.query(func.count(func.distinct(LeaveRequest.employee_id)))
            .filter(
                LeaveRequest.company_id == self.company_id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= on_date,
                LeaveRequest.end_date >= on_date,
            )
            .scalar()
            or 0
        )

    def get_summary(self) -> dict:
        today = date.today()
        total_employees = EmployeeRepository(self.db, self.company_id).count()
        present_today = AttendanceRepository(self.db, self.company_id).count_present_today()
        on_leave_today = self._count_on_leave(today)
        pending_approvals = LeaveRequestRepository(self.db, self.company_id).count_pending()

        return {
            "total_employees": total_employees,
            "present_today": present_today,
            "on_leave_today": on_leave_today,
            "pending_approvals": pending_approvals,
        }

    def get_on_leave_today(self) -> list[dict]:
        """Who's approved-on-leave today, by name — the Dashboard previously
        only showed a bare count (on_leave_today), so an Admin/Manager had
        no way to see *who* it actually was without digging into the Leave
        Management approval history."""
        today = date.today()
        requests = (
            self.db.query(LeaveRequest)
            .options(joinedload(LeaveRequest.employee).joinedload(Employee.department), joinedload(LeaveRequest.leave_type))
            .filter(
                LeaveRequest.company_id == self.company_id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= today,
                LeaveRequest.end_date >= today,
            )
            .all()
        )
        return [
            {
                "employee_id": r.employee_id,
                "full_name": r.employee.full_name if r.employee else None,
                "photo_url": r.employee.photo_url if r.employee else None,
                "department_name": r.employee.department.name if r.employee and r.employee.department else None,
                "leave_type_name": r.leave_type.name if r.leave_type else None,
                "start_date": r.start_date,
                "end_date": r.end_date,
            }
            for r in requests
        ]

    def get_attendance_overview(self, days: int = 7) -> list[dict]:
        # Company operates in IST; clock_in is stored in UTC. func.date()
        # would extract the UTC calendar date from clock_in and compare it
        # against `day` (an IST-local date) — same off-by-one risk as
        # get_live_status/count_present_today, so this uses explicit UTC
        # bounds per IST day instead.
        today_start_utc, _ = _today_utc_bounds()
        total_employees = EmployeeRepository(self.db, self.company_id).count()
        result = []

        for i in range(days - 1, -1, -1):
            day_start = today_start_utc - timedelta(days=i)
            day_end = day_start + timedelta(days=1) - timedelta(microseconds=1)
            day = (day_start + _IST_OFFSET).date()
            present = (
                self.db.query(func.count(func.distinct(AttendanceRecord.employee_id)))
                .filter(
                    AttendanceRecord.company_id == self.company_id,
                    AttendanceRecord.clock_in >= day_start,
                    AttendanceRecord.clock_in <= day_end,
                )
                .scalar()
                or 0
            )
            on_leave = self._count_on_leave(day)
            absent = max(total_employees - present - on_leave, 0)
            result.append({
                "date": day.isoformat(),
                "present": present,
                "absent": absent,
                "on_leave": on_leave,
            })

        return result

    def get_live_status(self) -> list[dict]:
        """Who's present today, company-wide. "online" means they clocked in
        today and haven't clocked out yet (a genuinely open session);
        "present" means they clocked in today but have already clocked out
        (or their session is stale/forgotten, per
        attendance_repo.STALE_SESSION_HOURS); "offline" means no clock-in at
        all today. Based on today's clock-in rather than strictly "is there
        an open session right now", since employees very often forget to
        clock out — a strict real-time-only view left this widget almost
        always empty despite people actually being at work."""
        employees = (
            self.db.query(Employee)
            .filter(Employee.company_id == self.company_id, Employee.employment_status == "active")
            .options(joinedload(Employee.department))
            .order_by(Employee.full_name.asc())
            .all()
        )

        start_dt, end_dt = _today_utc_bounds()
        today_records = (
            self.db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.company_id == self.company_id,
                AttendanceRecord.clock_in >= start_dt,
                AttendanceRecord.clock_in <= end_dt,
            )
            .order_by(AttendanceRecord.clock_in.asc())
            .all()
        )
        by_employee: dict[UUID, list[AttendanceRecord]] = {}
        for r in today_records:
            by_employee.setdefault(r.employee_id, []).append(r)

        result = []
        for e in employees:
            recs = by_employee.get(e.id, [])
            if not recs:
                result.append({
                    "employee_id": e.id,
                    "full_name": e.full_name,
                    "photo_url": e.photo_url,
                    "department_name": e.department.name if e.department else None,
                    "status": "offline",
                    "online_since": None,
                })
                continue

            open_record = next((r for r in recs if r.clock_out is None), None)
            result.append({
                "employee_id": e.id,
                "full_name": e.full_name,
                "photo_url": e.photo_url,
                "department_name": e.department.name if e.department else None,
                "status": "online" if open_record else "present",
                "online_since": recs[0].clock_in,
            })

        result.sort(key=lambda r: (r["status"] == "offline", r["status"] != "online", r["full_name"]))
        return result

    def get_leave_summary(self, year: int | None = None) -> list[dict]:
        if year is None:
            year = date.today().year

        requests = (
            self.db.query(LeaveType.name, LeaveRequest.start_date, LeaveRequest.end_date)
            .join(LeaveRequest, LeaveRequest.leave_type_id == LeaveType.id)
            .filter(
                LeaveRequest.company_id == self.company_id,
                LeaveRequest.status == "approved",
                func.extract("year", LeaveRequest.start_date) == year,
            )
            .all()
        )

        def normalize_name(n: str | None) -> str:
            if not n:
                return "Other"
            n_clean = n.strip()
            low = n_clean.lower()
            if "matern" in low or "patern" in low or "parent" in low:
                return "Parental Leave"
            if "personal" in low:
                return "Personal Leave"
            if "sick" in low:
                return "Sick Leave"
            if "annual" in low:
                return "Annual Leave"
            if "casual" in low:
                return "Casual Leave"
            if "loss of pay" in low or "lop" in low:
                return "Loss of Pay"
            return n_clean.title()

        totals: dict[str, int] = {}
        for name, start, end in requests:
            norm = normalize_name(name)
            days = (end - start).days + 1
            totals[norm] = totals.get(norm, 0) + days

        total_days = sum(totals.values()) or 1
        # Sort descending by days taken
        sorted_totals = sorted(totals.items(), key=lambda x: x[1], reverse=True)
        return [
            {
                "leave_type": name,
                "days": days,
                "percentage": round(days / total_days * 100, 1),
            }
            for name, days in sorted_totals
        ]

    def get_leave_insight(self, year: int | None = None) -> dict:
        """Company-wide leave usage this year vs. total possible entitlement
        (sum of every LeaveType's annual accrual, across every active
        employee) — drives the Dashboard's "Looks good" / "running high"
        banner from real numbers, not a hardcoded message."""
        if year is None:
            year = date.today().year

        breakdown = self.get_leave_summary(year)
        # get_leave_summary defaults an empty result's total_days to 1 to
        # avoid div-by-zero in its own percentages — undo that here so a
        # genuinely empty year reports 0 taken, not 1.
        requests_exist = (
            self.db.query(LeaveRequest)
            .filter(
                LeaveRequest.company_id == self.company_id,
                LeaveRequest.status == "approved",
                func.extract("year", LeaveRequest.start_date) == year,
            )
            .first()
            is not None
        )
        total_days_taken = sum(item["days"] for item in breakdown) if requests_exist else 0

        active_headcount = (
            self.db.query(func.count(Employee.id))
            .filter(Employee.company_id == self.company_id, Employee.employment_status == "active")
            .scalar()
            or 0
        )
        annual_entitlement_per_employee = (
            self.db.query(func.coalesce(func.sum(LeaveType.accrual_rate), 0))
            .filter(LeaveType.company_id == self.company_id)
            .scalar()
            or Decimal(0)
        ) * 12

        total_entitlement = float(annual_entitlement_per_employee) * active_headcount
        usage_percentage = round((total_days_taken / total_entitlement) * 100, 1) if total_entitlement > 0 else 0

        if total_days_taken == 0:
            level, message = "good", "No leave taken yet this year."
        elif usage_percentage <= 50:
            level, message = "good", "Looks good! No excess leave taken this year."
        elif usage_percentage <= 80:
            level, message = "neutral", "Leave usage is on track this year."
        else:
            level, message = "warning", "Leave usage is running high this year — worth a look."

        return {
            "year": year,
            "total_days_taken": total_days_taken,
            "total_entitlement": round(total_entitlement, 1),
            "usage_percentage": usage_percentage,
            "level": level,
            "message": message,
        }
