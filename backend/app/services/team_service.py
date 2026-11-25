"""My Team: what a plain employee can see of the people around them."""

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.attendance_record import AttendanceRecord
from app.models.company import Company
from app.models.department import Department
from app.models.employee import Employee
from app.models.holiday_calendar import HolidayCalendar
from app.models.leave_request import LeaveRequest

_IST_OFFSET = timedelta(hours=5, minutes=30)
_MAX_RESULTS = 20


def _today() -> date:
    return (datetime.now(timezone.utc) + _IST_OFFSET).date()


class TeamService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id

    def _active(self):
        return self.db.query(Employee).options(
            joinedload(Employee.department),
            joinedload(Employee.designation),
            joinedload(Employee.user_account),
        ).filter(Employee.company_id == self.company_id, Employee.employment_status == "active")

    def members(self, employee_id: UUID | None) -> dict:
        me = self.db.query(Employee).filter(
            Employee.company_id == self.company_id, Employee.id == employee_id,
        ).first() if employee_id else None
        if not me:
            return {"manager": None, "peers": [], "reports": []}

        manager, peers = None, []
        if me.manager_id:
            manager = self._active().filter(Employee.id == me.manager_id).first()
            peers = self._active().filter(
                Employee.manager_id == me.manager_id, Employee.id != me.id,
            ).order_by(Employee.full_name).all()
        reports = self._active().filter(
            Employee.manager_id == me.id,
        ).order_by(Employee.full_name).all()
        return {"manager": manager, "peers": peers, "reports": reports}

    def count(self, employee_id: UUID | None) -> int:
        team = self.members(employee_id)
        return (1 if team["manager"] else 0) + len(team["peers"]) + len(team["reports"])

    def get_team(self, employee_id: UUID | None) -> dict:
        team = self.members(employee_id)
        manager = [team["manager"]] if team["manager"] else []
        status = self._status_today([e.id for e in manager + team["peers"] + team["reports"]])

        # On a holiday or weekly off nobody is expected in: no status, no badge.
        default = None if self.is_day_off(_today()) else "not_in"

        def out(e: Employee) -> dict:
            return {**self._contact(e), "status": status.get(e.id, default)}

        return {
            "manager": out(team["manager"]) if team["manager"] else None,
            "peers": [out(e) for e in team["peers"]],
            "reports": [out(e) for e in team["reports"]],
        }

    def is_day_off(self, day: date) -> bool:
        company = self.db.query(Company).filter(Company.id == self.company_id).first()
        weekly_off = company.weekly_off_days if company else None
        if day.weekday() in (weekly_off if weekly_off is not None else [5, 6]):
            return True
        return self.db.query(HolidayCalendar.id).filter(
            HolidayCalendar.company_id == self.company_id,
            HolidayCalendar.holiday_date == day,
        ).first() is not None

    def find_colleagues(self, text: str) -> list[dict]:
        if len(text) < 2:
            return []
        rows = self._active().outerjoin(
            Department, Department.id == Employee.department_id,
        ).filter(or_(
            Employee.full_name.icontains(text, autoescape=True),
            Department.name.icontains(text, autoescape=True),
        )).order_by(Employee.full_name).limit(_MAX_RESULTS).all()
        return [self._contact(e) for e in rows]

    @staticmethod
    def _contact(e: Employee) -> dict:
        return {
            "id": e.id,
            "full_name": e.full_name,
            "photo_url": e.photo_url,
            "designation": e.designation.title if e.designation else None,
            "department_name": e.department.name if e.department else None,
            "email": e.user_account.email if e.user_account else None,
        }

    def _status_today(self, ids: list[UUID]) -> dict:
        """present / on_leave per employee. The leave type stays private."""
        if not ids:
            return {}
        today = _today()
        start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc) - _IST_OFFSET
        present = self.db.query(AttendanceRecord.employee_id).filter(
            AttendanceRecord.company_id == self.company_id,
            AttendanceRecord.employee_id.in_(ids),
            AttendanceRecord.clock_in >= start,
            AttendanceRecord.clock_in < start + timedelta(days=1),
            or_(AttendanceRecord.geofence_review_status.is_(None),
                AttendanceRecord.geofence_review_status != "rejected"),
        )
        on_leave = self.db.query(LeaveRequest.employee_id).filter(
            LeaveRequest.company_id == self.company_id,
            LeaveRequest.employee_id.in_(ids),
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= today,
        )
        # Approved leave wins over a stray clock-in, as on the attendance page.
        return {**{r[0]: "present" for r in present}, **{r[0]: "on_leave" for r in on_leave}}
