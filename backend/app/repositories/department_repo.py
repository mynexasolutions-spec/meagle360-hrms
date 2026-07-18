"""Department repository with tree-building support."""

from uuid import UUID
from sqlalchemy.orm import Session

from app.models.department import Department
from app.repositories.base import BaseRepository


class DepartmentRepository(BaseRepository[Department]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Department, db, company_id)

    def get_root_departments(self) -> list[Department]:
        """Get departments with no parent (top-level)."""
        return (
            self._scoped_query()
            .filter(Department.parent_department_id.is_(None))
            .all()
        )

    def get_children(self, parent_id: UUID) -> list[Department]:
        return (
            self._scoped_query()
            .filter(Department.parent_department_id == parent_id)
            .all()
        )
