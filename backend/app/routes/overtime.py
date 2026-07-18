"""Overtime routes — request + approval workflow."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.services.overtime_service import OvertimeService
from app.schemas.overtime import OvertimeCreate, OvertimeApproval, OvertimeResponse

router = APIRouter(prefix="/api/overtime", tags=["Overtime"])


def _to_response(o) -> OvertimeResponse:
    return OvertimeResponse(
        id=o.id, employee_id=o.employee_id,
        employee_name=o.employee.full_name if o.employee else None,
        request_date=o.request_date, hours=o.hours, reason=o.reason,
        status=o.status, created_at=o.created_at,
    )


@router.post("/request", response_model=OvertimeResponse, status_code=201)
def request_overtime(
    data: OvertimeCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = OvertimeService(db, company_id)
    req = svc.request_overtime(current_user.employee_id, data.model_dump())
    return _to_response(req)


@router.get("/my-requests", response_model=list[OvertimeResponse])
def my_requests(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = OvertimeService(db, company_id)
    return [_to_response(o) for o in svc.get_my_requests(current_user.employee_id, skip, limit)]


@router.get("/pending", response_model=list[OvertimeResponse])
def pending_requests(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("attendance:approve")),
):
    svc = OvertimeService(db, company_id)
    return [_to_response(o) for o in svc.get_pending_requests(skip, limit)]


@router.put("/approve/{request_id}", response_model=OvertimeResponse)
def approve_reject(
    request_id: UUID,
    data: OvertimeApproval,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("attendance:approve")),
):
    svc = OvertimeService(db, company_id)
    try:
        result = svc.approve_reject(request_id, data.status, current_user.employee_id)
        if not result:
            raise HTTPException(status_code=404, detail="Overtime request not found")
        return _to_response(result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
