"""AttendanceRegularization repository."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.attendance_regularization import AttendanceRegularization
from app.repositories.base import BaseRepository


class AttendanceRegularizationRepository(BaseRepository[AttendanceRegularization]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(AttendanceRegularization, db, company_id)

    def get_by_employee(self, employee_id: UUID, skip: int = 0, limit: int = 50):
        return (
            self._scoped_query()
            .filter(AttendanceRegularization.employee_id == employee_id)
            .order_by(AttendanceRegularization.created_at.desc())
            .offset(skip).limit(limit).all()
        )

    def get_pending(self, skip: int = 0, limit: int = 50):
        return (
            self._scoped_query()
            .options(joinedload(AttendanceRegularization.employee))
            .filter(AttendanceRegularization.status == "pending")
            .order_by(AttendanceRegularization.created_at.asc())
            .offset(skip).limit(limit).all()
        )

    def count_pending(self) -> int:
        return self._scoped_query().filter(AttendanceRegularization.status == "pending").count()

    def get_history(
        self,
        year: int | None = None,
        month: int | None = None,
        employee_id: UUID | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 200,
    ):
        """Every regularization request company-wide (pending, approved,
        rejected), optionally narrowed to one employee/month/status — unlike
        get_pending, approved/rejected requests don't disappear from this."""
        q = self._scoped_query().options(joinedload(AttendanceRegularization.employee))
        if employee_id:
            q = q.filter(AttendanceRegularization.employee_id == employee_id)
        if status:
            q = q.filter(AttendanceRegularization.status == status)
        if year and month:
            import calendar
            from datetime import date
            start = date(year, month, 1)
            end = date(year, month, calendar.monthrange(year, month)[1])
            q = q.filter(AttendanceRegularization.record_date >= start, AttendanceRegularization.record_date <= end)
        elif year:
            from sqlalchemy import extract
            q = q.filter(extract("year", AttendanceRegularization.record_date) == year)

        return (
            q.order_by(AttendanceRegularization.record_date.desc())
            .offset(skip).limit(limit).all()
        )
