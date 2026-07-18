"""Employee repository with directory and org-chart queries."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.employee import Employee
from app.models.user_account import UserAccount
from app.repositories.base import BaseRepository


class EmployeeRepository(BaseRepository[Employee]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Employee, db, company_id)

    def get_directory(self, skip: int = 0, limit: int = 100) -> list[Employee]:
        """Employee directory with department + account/role info eagerly loaded."""
        return (
            self._scoped_query()
            .options(
                joinedload(Employee.department),
                joinedload(Employee.site),
                joinedload(Employee.user_account).joinedload(UserAccount.role),
                joinedload(Employee.user_account).joinedload(UserAccount.role_links),
            )
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_code(self, code: str) -> Employee | None:
        return (
            self._scoped_query()
            .filter(Employee.employee_code == code)
            .first()
        )

    def get_top_level_employees(self) -> list[Employee]:
        """Employees with no manager (top of org chart)."""
        return (
            self._scoped_query()
            .filter(Employee.manager_id.is_(None))
            .options(joinedload(Employee.department))
            .all()
        )

    def get_direct_reports(self, manager_id: UUID) -> list[Employee]:
        return (
            self._scoped_query()
            .filter(Employee.manager_id == manager_id)
            .options(joinedload(Employee.department))
            .all()
        )

    def get_with_relations(self, employee_id: UUID) -> Employee | None:
        return (
            self._scoped_query()
            .options(
                joinedload(Employee.department),
                joinedload(Employee.manager),
                joinedload(Employee.site),
                joinedload(Employee.documents),
                joinedload(Employee.user_account).joinedload(UserAccount.role),
                joinedload(Employee.user_account).joinedload(UserAccount.role_links),
            )
            .filter(Employee.id == employee_id)
            .first()
        )
