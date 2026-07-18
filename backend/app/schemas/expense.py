"""Pydantic schemas for Expense management."""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class ExpenseCategoryCreate(BaseModel):
    name: str


class ExpenseCategoryResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseClaimCreate(BaseModel):
    category_id: UUID | None = None
    amount: Decimal
    expense_date: date
    description: str | None = None
    receipt_url: str | None = None


class ExpenseApprovalRequest(BaseModel):
    status: str  # approved, rejected


class ExpenseClaimResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    category_id: UUID | None
    category_name: str | None = None
    amount: Decimal
    expense_date: date
    description: str | None = None
    receipt_url: str | None = None
    status: str
    reviewed_at: datetime | None = None
    reimbursed_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True
