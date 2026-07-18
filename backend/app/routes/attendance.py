"""Attendance routes — clock-in/out, records, regularization, holidays, timesheet."""

from uuid import UUID
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_permissions
from app.models.user_account import UserAccount
from app.models.holiday_calendar import HolidayCalendar
from app.services.attendance_service import AttendanceService
from app.schemas.attendance import (
    ClockInRequest,
    AttendanceRecordResponse,
    HolidayCalendarCreate,
    HolidayCalendarResponse,
    TimesheetResponse,
)
from app.schemas.attendance_regularization import (
    RegularizationCreate,
    RegularizationApproval,
    RegularizationResponse,
)

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


@router.post("/clock-in", response_model=AttendanceRecordResponse)
def clock_in(
    data: ClockInRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = AttendanceService(db, company_id)
    try:
        record = svc.clock_in(
            employee_id=current_user.employee_id,
            source=data.source,
            location=data.location,
        )
        return record
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/clock-out", response_model=AttendanceRecordResponse)
def clock_out(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = AttendanceService(db, company_id)
    try:
        return svc.clock_out(current_user.employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _require_self_or_approver(current_user: UserAccount, employee_id: UUID | None) -> None:
    """Viewing your own attendance is always allowed; viewing someone
    else's requires attendance:approve (Admin/Manager/HR Manager)."""
    if employee_id is not None and employee_id != current_user.employee_id:
        if not current_user.merged_permissions.get("attendance:approve"):
            raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/records", response_model=list[AttendanceRecordResponse])
def get_records(
    employee_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    _require_self_or_approver(current_user, employee_id)
    if employee_id is None:
        employee_id = current_user.employee_id
    svc = AttendanceService(db, company_id)
    if start_date and end_date:
        return svc.get_by_date_range(start_date, end_date, employee_id)
    return svc.get_records(employee_id, skip, limit)


@router.get("/timesheet", response_model=TimesheetResponse)
def get_timesheet(
    year: int | None = None,
    month: int | None = None,
    employee_id: UUID | None = None,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    _require_self_or_approver(current_user, employee_id)
    now = datetime.now()
    y = year or now.year
    m = month or now.month
    emp_id = employee_id or current_user.employee_id
    svc = AttendanceService(db, company_id)
    return svc.get_timesheet(y, m, emp_id)


@router.get("/employee-overview")
def get_employee_overview(
    employee_id: UUID,
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Full month view for one employee: attendance sessions, leave,
    holidays, and overtime merged per calendar day. Same self-or-approver
    rule as /records and /timesheet — an Employee can only call this for
    their own employee_id; Admin/Manager/HR Manager (attendance:approve)
    can look up anyone."""
    _require_self_or_approver(current_user, employee_id)
    now = datetime.now()
    y = year or now.year
    m = month or now.month
    svc = AttendanceService(db, company_id)
    return svc.get_employee_overview(employee_id, y, m)


# ── Regularization requests ──────────────────────────────
@router.post("/regularization-requests", response_model=RegularizationResponse, status_code=201)
def request_regularization(
    data: RegularizationCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = AttendanceService(db, company_id)
    req = svc.request_regularization(current_user.employee_id, data.model_dump())
    return RegularizationResponse(
        id=req.id, employee_id=req.employee_id, employee_name=None,
        record_date=req.record_date, requested_clock_in=req.requested_clock_in,
        requested_clock_out=req.requested_clock_out, reason=req.reason,
        status=req.status, created_at=req.created_at,
    )


@router.get("/regularization-requests/my", response_model=list[RegularizationResponse])
def my_regularization_requests(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    svc = AttendanceService(db, company_id)
    reqs = svc.get_my_regularizations(current_user.employee_id, skip, limit)
    return [
        RegularizationResponse(
            id=r.id, employee_id=r.employee_id, employee_name=None,
            record_date=r.record_date, requested_clock_in=r.requested_clock_in,
            requested_clock_out=r.requested_clock_out, reason=r.reason,
            status=r.status, created_at=r.created_at,
        ) for r in reqs
    ]


@router.get("/regularization-requests/pending", response_model=list[RegularizationResponse])
def pending_regularization_requests(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("attendance:approve")),
):
    svc = AttendanceService(db, company_id)
    reqs = svc.get_pending_regularizations(skip, limit)
    return [
        RegularizationResponse(
            id=r.id, employee_id=r.employee_id,
            employee_name=r.employee.full_name if r.employee else None,
            record_date=r.record_date, requested_clock_in=r.requested_clock_in,
            requested_clock_out=r.requested_clock_out, reason=r.reason,
            status=r.status, created_at=r.created_at,
        ) for r in reqs
    ]


@router.put("/regularization-requests/{request_id}/approve", response_model=RegularizationResponse)
def approve_regularization_request(
    request_id: UUID,
    data: RegularizationApproval,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_permissions("attendance:approve")),
):
    svc = AttendanceService(db, company_id)
    try:
        result = svc.approve_reject_regularization(request_id, data.status, current_user.employee_id)
        if not result:
            raise HTTPException(status_code=404, detail="Regularization request not found")
        return RegularizationResponse(
            id=result.id, employee_id=result.employee_id, employee_name=None,
            record_date=result.record_date, requested_clock_in=result.requested_clock_in,
            requested_clock_out=result.requested_clock_out, reason=result.reason,
            status=result.status, created_at=result.created_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Holiday Calendar ─────────────────────────────────────
@router.get("/holidays", response_model=list[HolidayCalendarResponse])
def list_holidays(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    holidays = (
        db.query(HolidayCalendar)
        .filter(HolidayCalendar.company_id == company_id)
        .order_by(HolidayCalendar.holiday_date)
        .all()
    )
    return holidays


@router.post("/holidays", response_model=HolidayCalendarResponse, status_code=201)
def create_holiday(
    data: HolidayCalendarCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
):
    holiday = HolidayCalendar(company_id=company_id, **data.model_dump())
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday
