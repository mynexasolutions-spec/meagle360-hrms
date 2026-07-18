"""Expense routes — categories, claim submission, approval, reimbursement."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.expense_service import ExpenseService
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseClaimCreate,
    ExpenseApprovalRequest,
    ExpenseClaimResponse,
)

router = APIRouter(prefix="/api/expenses", tags=["Expenses"])


def _to_response(c) -> ExpenseClaimResponse:
    return ExpenseClaimResponse(
        id=c.id,
        employee_id=c.employee_id,
        employee_name=c.employee.full_name if c.employee else None,
        category_id=c.category_id,
        category_name=c.category.name if c.category else None,
        amount=c.amount,
        expense_date=c.expense_date,
        description=c.description,
        receipt_url=c.receipt_url,
        status=c.status,
        reviewed_at=c.reviewed_at,
        reimbursed_at=c.reimbursed_at,
        created_at=c.created_at,
    )


# ── Categories ───────────────────────────────────────────
@router.get("/categories", response_model=list[ExpenseCategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = ExpenseService(db, company_id)
    return svc.get_categories()


@router.post("/categories", response_model=ExpenseCategoryResponse, status_code=201)
def create_category(
    data: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("expenses:approve")),
):
    svc = ExpenseService(db, company_id)
    return svc.create_category(data.model_dump())


# ── Claims ───────────────────────────────────────────────
@router.post("/claims", response_model=ExpenseClaimResponse, status_code=201)
def submit_claim(
    data: ExpenseClaimCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("expenses:write")),
):
    svc = ExpenseService(db, company_id)
    claim = svc.submit_claim(current_user.employee_id, data.model_dump())
    return _to_response(claim)


@router.get("/my-claims", response_model=list[ExpenseClaimResponse])
def my_claims(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = ExpenseService(db, company_id)
    return [_to_response(c) for c in svc.get_my_claims(current_user.employee_id, skip, limit)]


@router.get("/pending", response_model=list[ExpenseClaimResponse])
def pending_claims(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("expenses:approve")),
):
    svc = ExpenseService(db, company_id)
    return [_to_response(c) for c in svc.get_pending_claims(skip, limit)]


@router.get("/", response_model=list[ExpenseClaimResponse])
def list_all_claims(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("expenses:approve")),
):
    """All claims company-wide — for the Expense Manager/Admin ledger view."""
    svc = ExpenseService(db, company_id)
    return [_to_response(c) for c in svc.get_all_claims(skip, limit)]


@router.put("/claims/{claim_id}/approve", response_model=ExpenseClaimResponse)
def approve_reject(
    claim_id: UUID,
    data: ExpenseApprovalRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("expenses:approve")),
):
    svc = ExpenseService(db, company_id)
    try:
        result = svc.approve_reject(claim_id, data.status, current_user.employee_id)
        if not result:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        return _to_response(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/claims/{claim_id}/reimburse", response_model=ExpenseClaimResponse)
def reimburse(
    claim_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("expenses:approve")),
):
    svc = ExpenseService(db, company_id)
    try:
        result = svc.mark_reimbursed(claim_id, current_user.employee_id)
        if not result:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        return _to_response(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
