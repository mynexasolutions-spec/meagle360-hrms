"""Pydantic schemas for Company."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class CompanyUpdate(BaseModel):
    name: str | None = None
    country: str | None = None
    multi_entity: bool | None = None
    weekly_off_days: list[int] | None = None  # 0=Monday ... 6=Sunday
    max_monthly_regularizations: int | None = None
    logo_url: str | None = None
    signature_url: str | None = None
    authorized_signatory_name: str | None = None
    company_address: str | None = None
    footer_text: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    cin_number: str | None = None
    registered_address: str | None = None


class CompanyResponse(BaseModel):
    id: UUID
    name: str
    country: str | None
    multi_entity: bool
    status: str
    plan_tier: str
    weekly_off_days: list[int]
    max_monthly_regularizations: int
    logo_url: str | None
    signature_url: str | None
    authorized_signatory_name: str | None
    company_address: str | None
    footer_text: str | None
    phone: str | None
    email: str | None
    website: str | None
    cin_number: str | None
    registered_address: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
