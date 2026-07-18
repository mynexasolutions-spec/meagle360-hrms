"""Pydantic schemas for Announcement."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class AnnouncementCreate(BaseModel):
    title: str
    body: str


class AnnouncementResponse(BaseModel):
    id: UUID
    title: str
    body: str
    created_by_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
