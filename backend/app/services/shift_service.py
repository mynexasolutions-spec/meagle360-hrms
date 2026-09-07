"""Shift service — shift template management and employee assignment."""

from uuid import UUID
from sqlalchemy.orm import Session

from app.repositories.shift_repo import ShiftRepository, EmployeeShiftRepository


class ShiftService:
    def __init__(self, db: Session, company_id: UUID):
        self.shift_repo = ShiftRepository(db, company_id)
        self.assignment_repo = EmployeeShiftRepository(db, company_id)

    # ── Shift Templates ──────────────────────────────────
    def list_shifts(self):
        return self.shift_repo.get_all()

    def create_shift(self, data: dict):
        return self.shift_repo.create(data)

    def update_shift(self, shift_id: UUID, data: dict):
        return self.shift_repo.update(shift_id, data)

    def delete_shift(self, shift_id: UUID) -> bool:
        return self.shift_repo.delete(shift_id)

    # ── Assignments ──────────────────────────────────────
    def assign_shift(self, data: dict):
        return self.assignment_repo.create(data)

    def get_roster(self, skip=0, limit=100):
        return self.assignment_repo.get_roster(skip, limit)

    def get_employee_shifts(self, employee_id: UUID):
        return self.assignment_repo.get_by_employee(employee_id)

    def update_assignment(self, assignment_id: UUID, data: dict):
        return self.assignment_repo.update(assignment_id, data)

    def delete_assignment(self, assignment_id: UUID) -> bool:
        return self.assignment_repo.delete(assignment_id)

