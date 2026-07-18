"""Shift repository — shift templates and employee assignments."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.shift import Shift
from app.models.employee_shift import EmployeeShift
from app.repositories.base import BaseRepository


class ShiftRepository(BaseRepository[Shift]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Shift, db, company_id)


class EmployeeShiftRepository(BaseRepository[EmployeeShift]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(EmployeeShift, db, company_id)

    def get_roster(self, skip: int = 0, limit: int = 100) -> list[EmployeeShift]:
        """Get all employee-shift assignments with relations loaded."""
        return (
            self._scoped_query()
            .options(
                joinedload(EmployeeShift.employee),
                joinedload(EmployeeShift.shift),
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_employee(self, employee_id: UUID) -> list[EmployeeShift]:
        return (
            self._scoped_query()
            .options(joinedload(EmployeeShift.shift))
            .filter(EmployeeShift.employee_id == employee_id)
            .order_by(EmployeeShift.effective_from.desc())
            .all()
        )
