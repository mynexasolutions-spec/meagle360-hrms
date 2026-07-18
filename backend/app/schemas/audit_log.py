"""Pydantic schemas for audit log."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: UUID
    actor_name: str | None = None
    action: str
    entity_type: str
    entity_id: UUID | None
    details: dict
    created_at: datetime

    class Config:
        from_attributes = True
