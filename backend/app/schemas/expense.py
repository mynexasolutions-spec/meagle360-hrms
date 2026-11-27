"""Pydantic schemas for Expense management."""

from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ExpenseCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None


class ExpenseCategoryResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


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
    # Old link-only receipts; uploaded ones are fetched via /claims/{id}/receipt.
    receipt_url: str | None = None
    has_receipt: bool = False
    receipt_filename: str | None = None
    status: str
    reviewed_at: datetime | None = None
    reimbursed_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True
