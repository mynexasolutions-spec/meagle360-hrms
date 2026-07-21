"""ActionItem service."""

from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.repositories.action_item_repo import ActionItemRepository
from app.schemas.action_item import ActionItemResponse


class ActionItemService:
    def __init__(self, db: Session, company_id: UUID):
        self.db = db
        self.company_id = company_id
        self.repo = ActionItemRepository(db, company_id)

    def create_action_item(self, created_by_id: UUID, data: dict):
        payload = {
            "company_id": self.company_id,
            "created_by_id": created_by_id,
            **data,
        }
        item = self.repo.create(payload)
        return self._to_response(item)

    def get_action_items(self, employee_id: UUID | None = None, is_admin: bool = False):
        if is_admin or not employee_id:
            items = self.repo.get_all_with_relations()
        else:
            items = self.repo.get_by_employee(employee_id)
        return [self._to_response(item) for item in items]

    def update_status(self, item_id: UUID, status: str, note: str | None = None):
        item = self.repo.get_by_id(item_id)
        if not item:
            return None
        
        update_data = {"status": status}
        if note:
            update_data["completion_note"] = note
        if status == "completed":
            update_data["completed_at"] = datetime.now(timezone.utc)
            
        item = self.repo.update(item_id, update_data)
        return self._to_response(item)

    def delete_action_item(self, item_id: UUID) -> bool:
        return self.repo.delete(item_id)

    def _to_response(self, item) -> ActionItemResponse:
        return ActionItemResponse(
            id=item.id,
            company_id=item.company_id,
            title=item.title,
            description=item.description,
            assigned_to_id=item.assigned_to_id,
            assigned_to_name=item.assigned_to.full_name if item.assigned_to else None,
            created_by_id=item.created_by_id,
            created_by_name=item.created_by.full_name if item.created_by else None,
            priority=item.priority,
            status=item.status,
            due_date=item.due_date,
            completion_note=item.completion_note,
            completed_at=item.completed_at,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
