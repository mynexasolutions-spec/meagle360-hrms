"""Pydantic schemas for Leave management."""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class LeaveTypeCreate(BaseModel):
    name: str
    accrual_rate: Decimal = Decimal("0")
    is_paid: bool = True


class LeaveTypeUpdate(BaseModel):
    name: str | None = None
    accrual_rate: Decimal | None = None
    is_paid: bool | None = None


class LeaveTypeResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    accrual_rate: Decimal
    is_paid: bool
    last_accrued_period: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class LeaveRequestCreate(BaseModel):
    leave_type_id: UUID
    start_date: date
    end_date: date


class LeaveRequestResponse(BaseModel):
    id: UUID
    employee_id: UUID
    leave_type_id: UUID
    start_date: date
    end_date: date
    status: str
    created_at: datetime
    leave_type_name: str | None = None

    class Config:
        from_attributes = True


class LeaveApprovalRequest(BaseModel):
    status: str  # approved, rejected


class LeaveBalanceResponse(BaseModel):
    id: UUID
    employee_id: UUID
    leave_type_id: UUID
    balance: Decimal
    year: int
    leave_type_name: str | None = None
    annual_entitlement: Decimal | None = None  # accrual_rate * 12, for "X / Y days" display

    class Config:
        from_attributes = True


class BalanceAdjustmentCreate(BaseModel):
    employee_id: UUID
    leave_type_id: UUID
    delta: Decimal  # positive to grant days, negative to deduct
    reason: str
    year: int | None = None


class AccrueMonthlyResponse(BaseModel):
    period: str
    leave_types_accrued: list[str]
    employees_processed: int
    already_run: bool
