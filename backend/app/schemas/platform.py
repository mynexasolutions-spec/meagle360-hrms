"""Pydantic schemas for the platform (Nexa Solutions) layer."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, EmailStr


class PlatformLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PlatformTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PlatformAdminResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_super_admin: bool

    class Config:
        from_attributes = True


class CompanyCreateRequest(BaseModel):
    name: str
    country: str | None = None
    multi_entity: bool = False
    plan_tier: str = "trial"
    trial_days: int | None = None  # required when plan_tier == "trial"
    seat_limit: int | None = None


class CompanyStatusUpdate(BaseModel):
    status: str  # active | suspended | cancelled


class CompanyAdminInviteRequest(BaseModel):
    email: EmailStr
    full_name: str
    employee_code: str = "EMP001"


class CompanyAdminInviteResponse(BaseModel):
    user_account_id: UUID
    email: str
    invite_token: str  # returned as a fallback in case the email below failed to send
    email_sent: bool = False


class SetPasswordRequest(BaseModel):
    token: str
    new_password: str


class PlatformCompanyResponse(BaseModel):
    id: UUID
    name: str
    subdomain: str
    country: str | None
    multi_entity: bool
    status: str
    plan_tier: str
    plan_ends_at: datetime | None
    days_remaining: int | None
    seat_limit: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CompanyUpdateRequest(BaseModel):
    name: str | None = None
    subdomain: str | None = None
    country: str | None = None
    plan_tier: str | None = None
    trial_days: int | None = None  # required when plan_tier is being changed to "trial"
    seat_limit: int | None = None


class CompanyUserResponse(BaseModel):
    user_account_id: UUID
    employee_id: UUID
    email: str
    full_name: str
    employee_code: str
    role_names: list[str]
    mfa_enabled: bool
    invite_accepted_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True
