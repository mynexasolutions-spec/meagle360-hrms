"""Pydantic schemas for Site."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class SiteCreate(BaseModel):
    name: str
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None


class SiteUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None


class SiteResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    address: str | None
    city: str | None
    state: str | None
    country: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
