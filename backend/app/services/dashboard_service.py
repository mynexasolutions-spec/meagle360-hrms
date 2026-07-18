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

    def get_attendance_overview(self, days: int = 7) -> list[dict]:
        today = date.today()
        total_employees = EmployeeRepository(self.db, self.company_id).count()
        result = []

        for i in range(days - 1, -1, -1):
            day = today - timedelta(days=i)
            present = (
                self.db.query(func.count(func.distinct(AttendanceRecord.employee_id)))
                .filter(
                    AttendanceRecord.company_id == self.company_id,
                    func.date(AttendanceRecord.clock_in) == day,
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
        """Who's clocked in right now vs offline, company-wide — an open
        attendance record (clock_in with no clock_out) means online."""
        employees = (
            self.db.query(Employee)
            .filter(Employee.company_id == self.company_id, Employee.employment_status == "active")
            .options(joinedload(Employee.department))
            .order_by(Employee.full_name.asc())
            .all()
        )
        open_records = AttendanceRepository(self.db, self.company_id).get_open_records()
        online_since = {r.employee_id: r.clock_in for r in open_records}

        result = [
            {
                "employee_id": e.id,
                "full_name": e.full_name,
                "department_name": e.department.name if e.department else None,
                "status": "online" if e.id in online_since else "offline",
                "online_since": online_since.get(e.id),
            }
            for e in employees
        ]
        result.sort(key=lambda r: (r["status"] != "online", r["full_name"]))
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

        totals: dict[str, int] = {}
        for name, start, end in requests:
            days = (end - start).days + 1
            totals[name] = totals.get(name, 0) + days

        total_days = sum(totals.values()) or 1
        return [
            {
                "leave_type": name,
                "days": days,
                "percentage": round(days / total_days * 100, 1),
            }
            for name, days in totals.items()
        ]
