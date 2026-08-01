"""Leave repository — types, balances, and requests."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.leave_type import LeaveType
from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest
from app.repositories.base import BaseRepository


class LeaveTypeRepository(BaseRepository[LeaveType]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(LeaveType, db, company_id)


class LeaveBalanceRepository(BaseRepository[LeaveBalance]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(LeaveBalance, db, company_id)

    def get_by_employee(self, employee_id: UUID, year: int) -> list[LeaveBalance]:
        return (
            self._scoped_query()
            .options(joinedload(LeaveBalance.leave_type))
            .filter(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.year == year,
            )
            .all()
        )

    def get_specific(
        self, employee_id: UUID, leave_type_id: UUID, year: int
    ) -> LeaveBalance | None:
        return (
            self._scoped_query()
            .filter(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == leave_type_id,
                LeaveBalance.year == year,
            )
            .first()
        )


class LeaveRequestRepository(BaseRepository[LeaveRequest]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(LeaveRequest, db, company_id)

    def get_by_employee_and_date_range(self, employee_id: UUID, start, end):
        """Approved/pending leave requests overlapping [start, end] — used to
        overlay leave onto an attendance calendar. Rejected/cancelled
        requests are excluded so they don't show as false "on leave" days."""
        return (
            self._scoped_query()
            .options(joinedload(LeaveRequest.leave_type))
            .filter(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.status.in_(["approved", "pending"]),
                LeaveRequest.start_date <= end,
                LeaveRequest.end_date >= start,
            )
            .all()
        )

    def get_by_employee(
        self, employee_id: UUID, skip: int = 0, limit: int = 50
    ) -> list[LeaveRequest]:
        return (
            self._scoped_query()
            .options(joinedload(LeaveRequest.leave_type))
            .filter(LeaveRequest.employee_id == employee_id)
            .order_by(LeaveRequest.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_pending(self, skip: int = 0, limit: int = 50) -> list[LeaveRequest]:
        """Get all pending requests (for manager approval queue)."""
        return (
            self._scoped_query()
            .options(
                joinedload(LeaveRequest.leave_type),
                joinedload(LeaveRequest.employee),
            )
            .filter(LeaveRequest.status == "pending")
            .order_by(LeaveRequest.created_at.asc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_pending(self) -> int:
        return (
            self._scoped_query()
            .filter(LeaveRequest.status == "pending")
            .count()
        )

    def get_history(
        self,
        year: int | None = None,
        month: int | None = None,
        employee_id: UUID | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 200,
    ) -> list[LeaveRequest]:
        """Company-wide leave request history for Admin/Manager review — every
        status (pending, approved, rejected), optionally narrowed to one
        employee and/or one month, since the Approval Queue only ever shows
        pending requests and loses everything the moment it's actioned."""
        q = self._scoped_query().options(
            joinedload(LeaveRequest.leave_type),
            joinedload(LeaveRequest.employee),
        )
        if employee_id:
            q = q.filter(LeaveRequest.employee_id == employee_id)
        if status:
            q = q.filter(LeaveRequest.status == status)
        if year and month:
            from datetime import date
            import calendar
            start = date(year, month, 1)
            end = date(year, month, calendar.monthrange(year, month)[1])
            q = q.filter(LeaveRequest.start_date <= end, LeaveRequest.end_date >= start)
        elif year:
            from sqlalchemy import extract
            q = q.filter(extract("year", LeaveRequest.start_date) == year)

        return (
            q.order_by(LeaveRequest.start_date.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
