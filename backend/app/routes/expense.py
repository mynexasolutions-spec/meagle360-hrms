"""Expense routes — categories, claim submission, approval, reimbursement."""

from datetime import date
from decimal import Decimal
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, has_any_permission, require_permissions
from app.models.user_account import UserAccount
from app.routes.required_document import document_errors, file_response
from app.services.expense_service import ExpenseService
from app.services.required_document_service import MAX_FILE_BYTES
from app.schemas.expense import (
    ExpenseCategoryCreate,
    ExpenseCategoryUpdate,
    ExpenseCategoryResponse,
    ExpenseApprovalRequest,
    ExpenseClaimResponse,
)

router = APIRouter(prefix="/api/expenses", tags=["Expenses"])

# Categories are company settings: only org admins manage them.
org_admin = require_permissions("settings:write")


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
        has_receipt=bool(c.receipt_storage_path),
        receipt_filename=c.receipt_filename,
        status=c.status,
        reviewed_at=c.reviewed_at,
        reimbursed_at=c.reimbursed_at,
        created_at=c.created_at,
    )


# ── Categories ───────────────────────────────────────────
@router.get("/categories", response_model=list[ExpenseCategoryResponse])
def list_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Active categories for the claim form; admins can ask for all."""
    if include_inactive and not has_any_permission(current_user, ["settings:write"]):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    svc = ExpenseService(db, company_id)
    return svc.get_categories(include_inactive)


@router.post("/categories", response_model=ExpenseCategoryResponse, status_code=201)
def create_category(
    data: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(org_admin),
):
    svc = ExpenseService(db, company_id)
    try:
        return svc.create_category(data.name, current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/categories/{category_id}", response_model=ExpenseCategoryResponse)
def update_category(
    category_id: UUID,
    data: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(org_admin),
):
    svc = ExpenseService(db, company_id)
    try:
        result = svc.update_category(category_id, data.model_dump(exclude_unset=True), current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Category not found")
    return result


# ── Claims ───────────────────────────────────────────────
@router.post("/claims", response_model=ExpenseClaimResponse, status_code=201)
def submit_claim(
    amount: Decimal = Form(..., max_digits=12, decimal_places=2),
    expense_date: date = Form(...),
    category_id: UUID | None = Form(None),
    description: str | None = Form(None, max_length=2000),
    receipt: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("expenses:write")),
):
    """Multipart: the claim fields plus an optional receipt (PDF/JPG/PNG, 2 MB)."""
    svc = ExpenseService(db, company_id)
    content = receipt.file.read(MAX_FILE_BYTES + 1) if receipt and receipt.filename else None
    data = {
        "amount": amount, "expense_date": expense_date, "category_id": category_id,
        "description": (description or "").strip() or None,
    }
    with document_errors():
        claim = svc.submit_claim(current_user.employee_id, data, content, receipt.filename if content else None)
    return _to_response(claim)


@router.get("/claims/{claim_id}/receipt")
def get_receipt(
    claim_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """The uploaded receipt, for the claimant and expense approvers only."""
    svc = ExpenseService(db, company_id)
    claim = svc.get_claim(claim_id)
    allowed = claim and (
        claim.employee_id == current_user.employee_id
        or has_any_permission(current_user, ["expenses:approve"])
    )
    if not allowed:
        raise HTTPException(status_code=404, detail="Expense claim not found")
    with document_errors():
        content = svc.receipt_content(claim)
    return file_response(content, claim.receipt_content_type, claim.receipt_filename or "receipt")


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
