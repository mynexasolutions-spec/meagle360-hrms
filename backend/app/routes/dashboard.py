"""Dashboard routes — summary stats and chart data for the home screen."""

from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import (
    COMPANY_STATS_PERMISSIONS,
    DIRECTORY_PERMISSIONS,
    get_company_id,
    get_current_user,
    has_any_permission,
    require_any_permission,
    require_permissions,
)
from app.models.user_account import UserAccount
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    perms = current_user.merged_permissions
    return DashboardService(db, company_id).get_summary(
        employee_id=current_user.employee_id,
        show_headcount=has_any_permission(current_user, DIRECTORY_PERMISSIONS),
        show_attendance=bool(perms.get("attendance:approve")),
        show_approvals=bool(perms.get("leave:approve")),
    )


@router.get("/attendance-overview")
def get_attendance_overview(
    days: int = 7,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_any_permission(COMPANY_STATS_PERMISSIONS)),
):
    return DashboardService(db, company_id).get_attendance_overview(days)


@router.get("/live-status")
def get_live_status(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("attendance:approve")),
):
    """Who's online (clocked in) vs offline, company-wide — Admin/Manager/HR
    Manager visibility only, same roles that already approve attendance."""
    return DashboardService(db, company_id).get_live_status()


@router.get("/on-leave-today")
def get_on_leave_today(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _=Depends(require_permissions("attendance:approve")),
):
    """Who's approved-on-leave today, by name — same visibility as
    live-status (Admin/Manager/HR Manager)."""
    return DashboardService(db, company_id).get_on_leave_today()


@router.get("/leave-summary")
def get_leave_summary(
    year: int | None = None,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_any_permission(COMPANY_STATS_PERMISSIONS)),
):
    return DashboardService(db, company_id).get_leave_summary(year)


@router.get("/leave-insight")
def get_leave_insight(
    year: int | None = None,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_any_permission(COMPANY_STATS_PERMISSIONS)),
):
    return DashboardService(db, company_id).get_leave_insight(year)
