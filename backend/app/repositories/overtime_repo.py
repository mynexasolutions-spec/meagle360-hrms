"""OvertimeRequest repository."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.overtime_request import OvertimeRequest
from app.repositories.base import BaseRepository


class OvertimeRepository(BaseRepository[OvertimeRequest]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(OvertimeRequest, db, company_id)

    def get_by_employee_and_date_range(self, employee_id: UUID, start, end):
        return (
            self._scoped_query()
            .filter(
                OvertimeRequest.employee_id == employee_id,
                OvertimeRequest.request_date >= start,
                OvertimeRequest.request_date <= end,
            )
            .all()
        )

    def get_by_employee(self, employee_id: UUID, skip: int = 0, limit: int = 50):
        return (
            self._scoped_query()
            .filter(OvertimeRequest.employee_id == employee_id)
            .order_by(OvertimeRequest.created_at.desc())
            .offset(skip).limit(limit).all()
        )

    def get_pending(self, skip: int = 0, limit: int = 50):
        return (
            self._scoped_query()
            .options(joinedload(OvertimeRequest.employee))
            .filter(OvertimeRequest.status == "pending")
            .order_by(OvertimeRequest.created_at.asc())
            .offset(skip).limit(limit).all()
        )

    def count_pending(self) -> int:
        return self._scoped_query().filter(OvertimeRequest.status == "pending").count()
