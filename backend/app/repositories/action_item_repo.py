"""ActionItem repository."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from app.models.action_item import ActionItem
from app.repositories.base import BaseRepository


class ActionItemRepository(BaseRepository[ActionItem]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(ActionItem, db, company_id)

    def get_all_with_relations(self, skip: int = 0, limit: int = 100):
        return (
            self._scoped_query()
            .options(
                joinedload(ActionItem.assigned_to),
                joinedload(ActionItem.created_by),
            )
            .order_by(ActionItem.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_employee(self, employee_id: UUID, skip: int = 0, limit: int = 100):
        return (
            self._scoped_query()
            .options(
                joinedload(ActionItem.assigned_to),
                joinedload(ActionItem.created_by),
            )
            .filter(
                (ActionItem.assigned_to_id == employee_id) | (ActionItem.created_by_id == employee_id)
            )
            .order_by(ActionItem.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
