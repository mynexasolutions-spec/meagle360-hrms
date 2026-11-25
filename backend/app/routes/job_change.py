"""Promote, demote and transfer employees (Admin only), and read job history."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, has_any_permission, require_permissions
from app.models.user_account import UserAccount
from app.schemas.job_change import JobChangeCreate, JobChangeResponse, ScheduledJobChangeResponse
from app.services.job_change_service import JobChangeService
from app.services.pms_monthly_service import today_ist
from app.services.scheduled_job_change_service import ScheduledJobChangeService

router = APIRouter(prefix="/api/employees/{employee_id}/job-changes", tags=["Job changes"])


@router.get("", response_model=list[JobChangeResponse])
def list_job_changes(
    employee_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    user: UserAccount = Depends(get_current_user),
):
    if user.employee_id != employee_id and not has_any_permission(user, ("employees:write", "settings:write")):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return JobChangeService(db, company_id).history(employee_id, has_any_permission(user, ("settings:write",)))


@router.post("", response_model=JobChangeResponse | ScheduledJobChangeResponse, status_code=201)
def create_job_change(
    employee_id: UUID,
    data: JobChangeCreate,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    user: UserAccount = Depends(require_permissions("settings:write")),
):
    if data.salary and not has_any_permission(user, ("payroll:write",)):
        raise HTTPException(status_code=403, detail="Revising salary needs payroll access")
    svc = JobChangeService(db, company_id)
    try:
        if data.effective_date > today_ist():
            scheduler = ScheduledJobChangeService(db, company_id)
            row = scheduler.schedule(employee_id, data, user.employee_id)
            if not row:
                raise HTTPException(status_code=404, detail="Employee not found")
            return scheduler.to_dict(row)
        change = svc.apply(employee_id, data.model_dump(exclude_unset=True), user.employee_id)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    if not change:
        raise HTTPException(status_code=404, detail="Employee not found")
    return svc.to_dict(change, True)


@router.get("/scheduled", response_model=list[ScheduledJobChangeResponse])
def list_scheduled(
    employee_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    return ScheduledJobChangeService(db, company_id).list_open(employee_id)


@router.delete("/scheduled/{change_id}", status_code=204)
def cancel_scheduled(
    employee_id: UUID,
    change_id: UUID,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    user: UserAccount = Depends(require_permissions("settings:write")),
):
    if not ScheduledJobChangeService(db, company_id).cancel(employee_id, change_id, user.employee_id):
        raise HTTPException(status_code=404, detail="This change is no longer scheduled")
