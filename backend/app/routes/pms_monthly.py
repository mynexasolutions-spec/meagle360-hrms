"""PMS routes: monthly reviews and yearly appraisals.

Appraisal finalize / release / close, score adjustment and payroll revisions
use the existing /cycles endpoints."""

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_admin_role
from app.models.user_account import UserAccount
from app.routes.pms import _call
from app.schemas.pms import GoalDirection
from app.services.pms_appraisal_service import PmsAppraisalService
from app.services.pms_monthly_service import PmsMonthlyService, month_key, parse_month, today_ist

router = APIRouter(prefix="/api/pms", tags=["PMS"])
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"


class _GoalFields(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    target_value: Decimal = Field(Decimal("100"), ge=Decimal("0.01"), lt=10**12, decimal_places=2)
    unit: str | None = Field(None, max_length=30)
    direction: GoalDirection = "higher_better"

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title is required")
        return v.strip()


class MonthRef(BaseModel):
    month: str = Field(..., pattern=MONTH)


class MonthlyGoalCreate(_GoalFields, MonthRef):
    employee_id: UUID | None = None


class MonthlyProgress(BaseModel):
    actual_value: Decimal = Field(..., ge=0, lt=10**12, decimal_places=2)
    note: str | None = Field(None, max_length=1000)


class MonthlyNote(MonthRef):
    note: str = Field("", max_length=2000)


class MonthlyReview(MonthRef):
    employee_id: UUID
    score: int = Field(..., ge=1, le=5)
    comment: str = Field("", max_length=2000)


class AppraisalCreate(BaseModel):
    from_month: str = Field(..., pattern=MONTH)
    to_month: str = Field(..., pattern=MONTH)
    min_months: int = Field(6, ge=1, le=12)


def _is_admin(user: UserAccount) -> bool:
    return any(r.name == "Admin" for r in user.all_roles)


def _svc(db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id)):
    return PmsMonthlyService(db, company_id)


def _app(db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id)):
    return PmsAppraisalService(db, company_id)


# ── Monthly ──────────────────────────────────────────────────
@router.get("/monthly")
def my_month(month: str | None = None, svc: PmsMonthlyService = Depends(_svc),
             user: UserAccount = Depends(get_current_user)):
    first = _call(parse_month, month or month_key(today_ist()))
    return _call(svc.my_month, first, user.employee_id, _is_admin(user))


@router.get("/monthly/team")
def team_month(month: str, everyone: bool = False, svc: PmsMonthlyService = Depends(_svc),
               user: UserAccount = Depends(get_current_user)):
    return _call(svc.team, _call(parse_month, month), user.employee_id, _is_admin(user), everyone)


@router.post("/monthly/goals", status_code=201)
def add_goal(data: MonthlyGoalCreate, svc: PmsMonthlyService = Depends(_svc),
             user: UserAccount = Depends(get_current_user)):
    body = data.model_dump()
    first = _call(parse_month, body.pop("month"))
    return {"id": _call(svc.add_goal, first, user.employee_id, _is_admin(user), body).id}


@router.post("/monthly/goals/copy")
def copy_goals(data: MonthRef, svc: PmsMonthlyService = Depends(_svc),
               user: UserAccount = Depends(get_current_user)):
    return {"copied": _call(svc.copy_previous_goals, _call(parse_month, data.month),
                            user.employee_id)}


@router.put("/monthly/goals/{goal_id}")
def update_goal(goal_id: UUID, data: _GoalFields, svc: PmsMonthlyService = Depends(_svc),
                user: UserAccount = Depends(get_current_user)):
    return {"id": _call(svc.update_goal, goal_id, user.employee_id, _is_admin(user),
                        data.model_dump()).id}


@router.delete("/monthly/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: UUID, svc: PmsMonthlyService = Depends(_svc),
                user: UserAccount = Depends(get_current_user)):
    _call(svc.delete_goal, goal_id, user.employee_id, _is_admin(user))


@router.post("/monthly/goals/{goal_id}/progress", status_code=201)
def record_progress(goal_id: UUID, data: MonthlyProgress, svc: PmsMonthlyService = Depends(_svc),
                    user: UserAccount = Depends(get_current_user)):
    _call(svc.record_progress, goal_id, user.employee_id, _is_admin(user),
          data.actual_value, data.note)
    return {"status": "recorded"}


@router.put("/monthly/note")
def save_note(data: MonthlyNote, svc: PmsMonthlyService = Depends(_svc),
              user: UserAccount = Depends(get_current_user)):
    _call(svc.save_note, _call(parse_month, data.month), user.employee_id, data.note)
    return {"status": "saved"}


@router.post("/monthly/review")
def review(data: MonthlyReview, svc: PmsMonthlyService = Depends(_svc),
           user: UserAccount = Depends(get_current_user)):
    _call(svc.review, _call(parse_month, data.month), data.employee_id, user.employee_id,
          _is_admin(user), data.score, data.comment)
    return {"status": "reviewed"}


# ── Appraisals ───────────────────────────────────────────────
@router.get("/appraisals/me")
def my_appraisals(svc: PmsAppraisalService = Depends(_app),
                  user: UserAccount = Depends(get_current_user)):
    return svc.mine(user.employee_id)


@router.get("/appraisals")
def list_appraisals(svc: PmsAppraisalService = Depends(_app),
                    _: UserAccount = Depends(require_admin_role())):
    return [{"id": c.id, "name": c.name, "status": c.status} for c in svc.list_all()]


@router.post("/appraisals", status_code=201)
def create_appraisal(data: AppraisalCreate, svc: PmsAppraisalService = Depends(_app),
                     user: UserAccount = Depends(require_admin_role())):
    c = _call(svc.create, user.employee_id, _call(parse_month, data.from_month),
              _call(parse_month, data.to_month), data.min_months)
    return {"id": c.id}


@router.get("/appraisals/{cycle_id}")
def get_appraisal(cycle_id: UUID, svc: PmsAppraisalService = Depends(_app),
                  _: UserAccount = Depends(require_admin_role())):
    return _call(svc.detail, cycle_id)


@router.delete("/appraisals/{cycle_id}", status_code=204)
def delete_appraisal(cycle_id: UUID, svc: PmsAppraisalService = Depends(_app),
                     user: UserAccount = Depends(require_admin_role())):
    _call(svc.delete, user.employee_id, cycle_id)
