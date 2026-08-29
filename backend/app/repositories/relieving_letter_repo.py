"""RelievingLetterRecord repository."""

from sqlalchemy.orm import Session
from uuid import UUID

from app.models.relieving_letter_record import RelievingLetterRecord
from app.repositories.base import BaseRepository


class RelievingLetterRepository(BaseRepository[RelievingLetterRecord]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(RelievingLetterRecord, db, company_id)

    def get_for_employee(self, employee_id: UUID) -> list[RelievingLetterRecord]:
        """History of relieving letters generated for one employee."""
        return (
            self._scoped_query()
            .filter(RelievingLetterRecord.employee_id == employee_id)
            .order_by(RelievingLetterRecord.created_at.desc())
            .all()
        )
