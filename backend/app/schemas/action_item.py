"""ActionItem Pydantic schemas."""

import uuid
from datetime import date, datetime
from pydantic import BaseModel


class ActionItemCreate(BaseModel):
    title: str
    description: str | None = None
    assigned_to_id: uuid.UUID
    priority: str = "medium"  # low, medium, high, urgent
    due_date: date | None = None


class ActionItemUpdateStatus(BaseModel):
    status: str  # todo, in_progress, completed, cancelled
    completion_note: str | None = None


class ActionItemResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    title: str
    description: str | None = None
    assigned_to_id: uuid.UUID
    assigned_to_name: str | None = None
    created_by_id: uuid.UUID | None = None
    created_by_name: str | None = None
    priority: str
    status: str
    due_date: date | None = None
    completion_note: str | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
