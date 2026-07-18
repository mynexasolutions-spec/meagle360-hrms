"""Pydantic schemas for Company."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class CompanyUpdate(BaseModel):
    name: str | None = None
    country: str | None = None
    multi_entity: bool | None = None
    weekly_off_days: list[int] | None = None  # 0=Monday ... 6=Sunday


class CompanyResponse(BaseModel):
    id: UUID
    name: str
    country: str | None
    multi_entity: bool
    status: str
    plan_tier: str
    weekly_off_days: list[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
