"""Pydantic schemas for authentication."""

from uuid import UUID
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    employee_code: str
    company_id: UUID
    role_id: UUID | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str  # user_account.id
    company_id: str
    role_id: str | None = None
    exp: int | None = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    employee_id: UUID
    company_id: UUID
    role_id: UUID | None
    mfa_enabled: bool
    full_name: str | None = None
    role_name: str | None = None
    permissions: dict = {}

    class Config:
        from_attributes = True
