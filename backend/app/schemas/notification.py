"""Notification Pydantic schemas."""

import uuid
from datetime import datetime
from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    recipient_employee_id: uuid.UUID
    actor_employee_id: uuid.UUID | None = None
    type: str
    title: str
    message: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    link: str | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class UnreadCountResponse(BaseModel):
    unread_count: int


class MarkAllReadResponse(BaseModel):
    marked_count: int
