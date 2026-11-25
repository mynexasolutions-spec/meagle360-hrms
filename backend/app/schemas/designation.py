"""Pydantic schemas for Designation."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class DesignationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    level: int | None = Field(default=None, ge=1, le=20)


class DesignationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    level: int | None = Field(default=None, ge=1, le=20)
    is_active: bool | None = None


class DesignationResponse(BaseModel):
    id: UUID
    company_id: UUID
    title: str
    level: int | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
