"""Leave routes — types, requests, approvals, balances."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.leave_service import LeaveService
from app.schemas.leave import (
    LeaveTypeCreate,
    LeaveTypeUpdate,
    LeaveTypeResponse,
    LeaveRequestCreate,
    LeaveRequestResponse,
    LeaveApprovalRequest,
    LeaveBalanceResponse,
    BalanceAdjustmentCreate,
    AccrueMonthlyResponse,
)

router = APIRouter(prefix="/api/leave", tags=["Leave"])


# ── Leave Types ──────────────────────────────────────────
@router.get("/types", response_model=list[LeaveTypeResponse])
def list_leave_types(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    svc = LeaveService(db, company_id)
    return svc.get_leave_types()


@router.post("/types", response_model=LeaveTypeResponse, status_code=201)
def create_leave_type(
    data: LeaveTypeCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("settings:write")),
):
    svc = LeaveService(db, company_id)
    return svc.create_leave_type(data.model_dump())


@router.put("/types/{leave_type_id}", response_model=LeaveTypeResponse)
def update_leave_type(
    leave_type_id: UUID,
    data: LeaveTypeUpdate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("settings:write")),
):
    svc = LeaveService(db, company_id)
    leave_type = svc.update_leave_type(leave_type_id, data.model_dump(exclude_unset=True))
    if not leave_type:
        raise HTTPException(status_code=404, detail="Leave type not found")
    return leave_type


# ── Leave Requests ───────────────────────────────────────
@router.post("/request", response_model=LeaveRequestResponse, status_code=201)
def request_leave(
    data: LeaveRequestCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = LeaveService(db, company_id)
    try:
        return svc.request_leave(current_user.employee_id, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/my-requests", response_model=list[LeaveRequestResponse])
def my_requests(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = LeaveService(db, company_id)
    requests = svc.get_my_requests(current_user.employee_id, skip, limit)
    return [
        LeaveRequestResponse(
            id=r.id,
            employee_id=r.employee_id,
            leave_type_id=r.leave_type_id,
            start_date=r.start_date,
            end_date=r.end_date,
            status=r.status,
            created_at=r.created_at,
            leave_type_name=r.leave_type.name if r.leave_type else None,
            employee_name=r.employee.full_name if r.employee else None,
        )
        for r in requests
    ]


@router.get("/pending", response_model=list[LeaveRequestResponse])
def pending_requests(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("leave:approve")),
):
    svc = LeaveService(db, company_id)
    requests = svc.get_pending_requests(skip, limit)
    return [
        LeaveRequestResponse(
            id=r.id,
            employee_id=r.employee_id,
            leave_type_id=r.leave_type_id,
            start_date=r.start_date,
            end_date=r.end_date,
            status=r.status,
            created_at=r.created_at,
            leave_type_name=r.leave_type.name if r.leave_type else None,
            employee_name=r.employee.full_name if r.employee else None,
        )
        for r in requests
    ]


@router.get("/history", response_model=list[LeaveRequestResponse])
def leave_history(
    year: int | None = None,
    month: int | None = None,
    employee_id: UUID | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("leave:approve")),
):
    """Every leave request company-wide (pending, approved, rejected),
    optionally filtered to one employee and/or one month — unlike /pending,
    approved/rejected requests don't disappear from this view."""
    svc = LeaveService(db, company_id)
    requests = svc.get_history(year, month, employee_id, status, skip, limit)
    return [
        LeaveRequestResponse(
            id=r.id,
            employee_id=r.employee_id,
            leave_type_id=r.leave_type_id,
            start_date=r.start_date,
            end_date=r.end_date,
            status=r.status,
            created_at=r.created_at,
            leave_type_name=r.leave_type.name if r.leave_type else None,
            employee_name=r.employee.full_name if r.employee else None,
        )
        for r in requests
    ]


@router.put("/approve/{request_id}", response_model=LeaveRequestResponse)
def approve_reject(
    request_id: UUID,
    data: LeaveApprovalRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("leave:approve")),
):
    svc = LeaveService(db, company_id)
    try:
        result = svc.approve_reject(request_id, data.status, current_user.employee_id)
        if not result:
            raise HTTPException(status_code=404, detail="Leave request not found")
        return LeaveRequestResponse(
            id=result.id,
            employee_id=result.employee_id,
            leave_type_id=result.leave_type_id,
            start_date=result.start_date,
            end_date=result.end_date,
            status=result.status,
            created_at=result.created_at,
            leave_type_name=result.leave_type.name if result.leave_type else None,
            employee_name=result.employee.full_name if result.employee else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Balances ─────────────────────────────────────────────
@router.get("/balance", response_model=list[LeaveBalanceResponse])
def get_balance(
    year: int | None = None,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = LeaveService(db, company_id)
    balances = svc.get_balances(current_user.employee_id, year)
    return [
        LeaveBalanceResponse(
            id=b.id,
            employee_id=b.employee_id,
            leave_type_id=b.leave_type_id,
            balance=b.balance,
            year=b.year,
            leave_type_name=b.leave_type.name if b.leave_type else None,
            annual_entitlement=(b.leave_type.accrual_rate * 12) if b.leave_type else None,
        )
        for b in balances
    ]


@router.post("/accrue-monthly", response_model=AccrueMonthlyResponse)
def accrue_monthly(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    svc = LeaveService(db, company_id)
    return svc.accrue_monthly(current_user.employee_id)


@router.post("/balance/adjust", response_model=LeaveBalanceResponse)
def adjust_balance(
    data: BalanceAdjustmentCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("settings:write")),
):
    svc = LeaveService(db, company_id)
    balance = svc.adjust_balance(
        data.employee_id, data.leave_type_id, data.delta, data.reason,
        current_user.employee_id, data.year,
    )
    return LeaveBalanceResponse(
        id=balance.id,
        employee_id=balance.employee_id,
        leave_type_id=balance.leave_type_id,
        balance=balance.balance,
        year=balance.year,
        leave_type_name=balance.leave_type.name if balance.leave_type else None,
        annual_entitlement=(balance.leave_type.accrual_rate * 12) if balance.leave_type else None,
    )
