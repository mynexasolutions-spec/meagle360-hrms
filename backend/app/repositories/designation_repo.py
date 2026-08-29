"""Designation repository."""

from sqlalchemy.orm import Session
from uuid import UUID

from app.models.designation import Designation
from app.repositories.base import BaseRepository


class DesignationRepository(BaseRepository[Designation]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(Designation, db, company_id)

    def get_active(self) -> list[Designation]:
        """Designations available for selection (excludes deactivated ones)."""
        return self._scoped_query().filter(Designation.is_active.is_(True)).all()
