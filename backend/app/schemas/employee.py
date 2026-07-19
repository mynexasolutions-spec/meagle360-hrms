"""Pydantic schemas for Employee."""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, EmailStr


class EmployeeCreate(BaseModel):
    full_name: str
    employee_code: str
    department_id: UUID | None = None
    manager_id: UUID | None = None
    site_id: UUID | None = None
    date_of_hire: date
    employment_status: str = "active"


class EmployeeInviteRequest(BaseModel):
    email: EmailStr
    full_name: str
    employee_code: str
    role_id: UUID
    department_id: UUID | None = None
    manager_id: UUID | None = None
    site_id: UUID | None = None
    date_of_hire: date


class EmployeeInviteResponse(BaseModel):
    employee_id: UUID
    user_account_id: UUID
    email: str
    invite_token: str  # in production this is emailed, not returned in the response


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    department_id: UUID | None = None
    manager_id: UUID | None = None
    site_id: UUID | None = None
    employment_status: str | None = None
    photo_url: str | None = None
    personal_email: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    employment_type: str | None = None  # full_time | fixed_term | contractor | intern
    pan_number: str | None = None
    uan_number: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None
    esi_number: str | None = None
    esi_registered_date: date | None = None
    epf_applicable: bool | None = None
    esi_applicable: bool | None = None
    tax_regime: str | None = None  # old | new
    declared_investments: Decimal | None = None


class EmployeeResponse(BaseModel):
    id: UUID
    company_id: UUID
    department_id: UUID | None
    manager_id: UUID | None
    site_id: UUID | None
    full_name: str
    employee_code: str
    date_of_hire: date
    employment_status: str
    photo_url: str | None
    personal_email: str | None
    phone: str | None
    date_of_birth: date | None
    gender: str | None
    address: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    employment_type: str
    date_of_exit: date | None = None
    exit_reason: str | None = None
    pan_number: str | None = None
    uan_number: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None
    esi_number: str | None = None
    esi_registered_date: date | None = None
    epf_applicable: bool | None = None
    esi_applicable: bool | None = None
    tax_regime: str | None = None
    declared_investments: Decimal
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmployeeProfileResponse(BaseModel):
    id: UUID
    company_id: UUID
    department_id: UUID | None
    department_name: str | None = None
    manager_id: UUID | None
    manager_name: str | None = None
    site_id: UUID | None = None
    site_name: str | None = None
    full_name: str
    employee_code: str
    date_of_hire: date
    employment_status: str
    photo_url: str | None = None
    personal_email: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    employment_type: str = "full_time"
    date_of_exit: date | None = None
    exit_reason: str | None = None
    pan_number: str | None = None
    uan_number: str | None = None
    bank_account_number: str | None = None
    bank_ifsc: str | None = None
    esi_number: str | None = None
    esi_registered_date: date | None = None
    epf_applicable: bool | None = None
    esi_applicable: bool | None = None
    tax_regime: str | None = None
    declared_investments: Decimal = Decimal("0")
    created_at: datetime
    updated_at: datetime
    account_status: str = "no_login"  # no_login | invited | active
    role_names: list[str] = []
    email: str | None = None
    primary_role_id: UUID | None = None
    additional_role_ids: list[UUID] = []


class EmployeeRolesUpdate(BaseModel):
    additional_role_ids: list[UUID] = []


class EmployeeDirectoryItem(BaseModel):
    id: UUID
    full_name: str
    employee_code: str
    department_name: str | None = None
    site_name: str | None = None
    photo_url: str | None = None
    employment_status: str
    date_of_hire: date
    account_status: str = "no_login"  # no_login | invited | active
    role_names: list[str] = []
    email: str | None = None

    class Config:
        from_attributes = True


class OrgChartNode(BaseModel):
    id: UUID
    full_name: str
    employee_code: str
    department_name: str | None = None
    direct_reports: list["OrgChartNode"] = []

    class Config:
        from_attributes = True


class EmployeeDocumentCreate(BaseModel):
    doc_type: str
    file_url: str
    e_signed: bool = False


class EmployeeDocumentResponse(BaseModel):
    id: UUID
    employee_id: UUID
    doc_type: str
    file_url: str
    e_signed: bool
    created_at: datetime

    class Config:
        from_attributes = True
