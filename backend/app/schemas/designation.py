"""Pydantic schemas for Designation."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class DesignationCreate(BaseModel):
    title: str


class DesignationUpdate(BaseModel):
    title: str | None = None
    is_active: bool | None = None


class DesignationResponse(BaseModel):
    id: UUID
    company_id: UUID
    title: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
