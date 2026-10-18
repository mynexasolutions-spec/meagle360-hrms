"""PMS routes — Phase 2: review cycles, goals, KPI templates."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_admin_role
from app.models.user_account import UserAccount
from app.routes.pms import _call
from app.schemas.pms import (
    ApplyTemplate, CycleCreate, CycleOut, GoalCreate, GoalOut, GoalsApprove, GoalsReturn,
    GoalUpdate, KpiTemplateCreate, KpiTemplateOut, ParticipantOut, ProgressCreate, ProgressOut,
)
from app.services.pms_cycle_service import PmsCycleService
from app.services.pms_goal_service import PmsGoalService

router = APIRouter(prefix="/api/pms", tags=["PMS"])


def _is_admin(user: UserAccount) -> bool:
    return any(r.name == "Admin" for r in user.all_roles)


# ── Cycles ───────────────────────────────────────────────────
@router.get("/cycles", response_model=list[CycleOut])
def list_cycles(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return PmsCycleService(db, company_id).list_cycles(include_draft=_is_admin(current_user))


@router.post("/cycles", response_model=CycleOut, status_code=201)
def create_cycle(
    data: CycleCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsCycleService(db, company_id).create_cycle,
                 current_user.employee_id, data.model_dump())


@router.get("/cycles/{cycle_id}", response_model=CycleOut)
def get_cycle(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    cycle = _call(PmsCycleService(db, company_id).get_cycle, cycle_id)
    if cycle.status == "draft" and not _is_admin(current_user):
        raise HTTPException(status_code=404, detail="Cycle not found")
    return cycle


@router.delete("/cycles/{cycle_id}", status_code=204)
def delete_cycle(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    _call(PmsCycleService(db, company_id).delete_draft, current_user.employee_id, cycle_id)


@router.post("/cycles/{cycle_id}/launch", response_model=CycleOut)
def launch_cycle(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsCycleService(db, company_id).launch, current_user.employee_id, cycle_id)


@router.post("/cycles/{cycle_id}/advance", response_model=CycleOut)
def advance_cycle(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsCycleService(db, company_id).advance, current_user.employee_id, cycle_id)


@router.get("/cycles/{cycle_id}/participants", response_model=list[ParticipantOut])
def list_participants(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    rows = _call(PmsCycleService(db, company_id).list_participants,
                 cycle_id, current_user.employee_id, _is_admin(current_user))
    return [ParticipantOut(
        id=p.id, employee_id=p.employee_id,
        employee_name=p.employee.full_name if p.employee else None,
        manager_id=p.manager_id, department_id=p.department_id, status=p.status) for p in rows]


# ── Goals ────────────────────────────────────────────────────
@router.get("/cycles/{cycle_id}/goals", response_model=list[GoalOut])
def list_goals(
    cycle_id: UUID, employee_id: UUID | None = None,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    target = employee_id or current_user.employee_id
    if not target:
        raise HTTPException(status_code=400, detail="No employee record linked to this account")
    return _call(PmsGoalService(db, company_id).list_goals,
                 cycle_id, target, current_user.employee_id, _is_admin(current_user))


@router.post("/cycles/{cycle_id}/goals", response_model=GoalOut, status_code=201)
def create_goal(
    cycle_id: UUID, data: GoalCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return _call(PmsGoalService(db, company_id).create_goal,
                 cycle_id, current_user.employee_id, _is_admin(current_user), data.model_dump())


@router.put("/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: UUID, data: GoalUpdate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return _call(PmsGoalService(db, company_id).update_goal,
                 goal_id, current_user.employee_id, _is_admin(current_user),
                 data.model_dump(exclude_unset=True))


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(
    goal_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    _call(PmsGoalService(db, company_id).delete_goal,
          goal_id, current_user.employee_id, _is_admin(current_user))


@router.post("/cycles/{cycle_id}/goals/submit")
def submit_goals(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    n = _call(PmsGoalService(db, company_id).submit_goals, cycle_id, current_user.employee_id)
    return {"submitted": n}


@router.post("/cycles/{cycle_id}/goals/approve")
def approve_goals(
    cycle_id: UUID, data: GoalsApprove,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    n = _call(PmsGoalService(db, company_id).approve_goals, cycle_id, data.employee_id,
              current_user.employee_id, _is_admin(current_user))
    return {"approved": n}


@router.post("/cycles/{cycle_id}/goals/return")
def return_goals(
    cycle_id: UUID, data: GoalsReturn,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    n = _call(PmsGoalService(db, company_id).return_goals, cycle_id, data.employee_id,
              current_user.employee_id, _is_admin(current_user), data.reason)
    return {"returned": n}


@router.post("/goals/{goal_id}/progress", response_model=ProgressOut, status_code=201)
def record_progress(
    goal_id: UUID, data: ProgressCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return _call(PmsGoalService(db, company_id).record_progress,
                 goal_id, current_user.employee_id, _is_admin(current_user), data.model_dump())


# ── KPI templates ────────────────────────────────────────────
@router.get("/kpi-templates", response_model=list[KpiTemplateOut])
def list_templates(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(get_current_user),
):
    return PmsGoalService(db, company_id).list_templates()


@router.post("/kpi-templates", response_model=KpiTemplateOut, status_code=201)
def create_template(
    data: KpiTemplateCreate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsGoalService(db, company_id).create_template,
                 current_user.employee_id, data.model_dump())


@router.delete("/kpi-templates/{template_id}", status_code=204)
def delete_template(
    template_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    _call(PmsGoalService(db, company_id).delete_template, current_user.employee_id, template_id)


@router.post("/cycles/{cycle_id}/goals/apply-template", response_model=list[GoalOut], status_code=201)
def apply_template(
    cycle_id: UUID, data: ApplyTemplate,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return _call(PmsGoalService(db, company_id).apply_template, cycle_id, data.template_id,
                 data.employee_id, current_user.employee_id, _is_admin(current_user))
