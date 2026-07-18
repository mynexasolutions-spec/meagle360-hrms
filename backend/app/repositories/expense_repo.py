"""Expense repository — categories and claims."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.expense_category import ExpenseCategory
from app.models.expense_claim import ExpenseClaim
from app.repositories.base import BaseRepository


class ExpenseCategoryRepository(BaseRepository[ExpenseCategory]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(ExpenseCategory, db, company_id)


class ExpenseClaimRepository(BaseRepository[ExpenseClaim]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(ExpenseClaim, db, company_id)

    def get_by_employee(self, employee_id: UUID, skip: int = 0, limit: int = 50):
        return (
            self._scoped_query()
            .options(joinedload(ExpenseClaim.category))
            .filter(ExpenseClaim.employee_id == employee_id)
            .order_by(ExpenseClaim.created_at.desc())
            .offset(skip).limit(limit).all()
        )

    def get_pending(self, skip: int = 0, limit: int = 50):
        return (
            self._scoped_query()
            .options(
                joinedload(ExpenseClaim.category),
                joinedload(ExpenseClaim.employee),
            )
            .filter(ExpenseClaim.status == "pending")
            .order_by(ExpenseClaim.created_at.asc())
            .offset(skip).limit(limit).all()
        )

    def get_all(self, skip: int = 0, limit: int = 100):
        return (
            self._scoped_query()
            .options(
                joinedload(ExpenseClaim.category),
                joinedload(ExpenseClaim.employee),
            )
            .order_by(ExpenseClaim.created_at.desc())
            .offset(skip).limit(limit).all()
        )

    def count_pending(self) -> int:
        return self._scoped_query().filter(ExpenseClaim.status == "pending").count()
