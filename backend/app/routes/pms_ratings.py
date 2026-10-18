"""PMS routes — Phase 3: assignments, rating submission, scoring."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_admin_role
from app.models.user_account import UserAccount
from app.routes.pms import _call
from app.schemas.pms import (
    CompletionOut, ReviewerSet, ScoreOut, SubmitRatings,
    TaskDetailOut, TaskOut,
)
from app.services.pms_assignment_service import PmsAssignmentService
from app.services.pms_rating_service import PmsRatingService

router = APIRouter(prefix="/api/pms", tags=["PMS"])


# ── Rater tasks ──────────────────────────────────────────────
@router.get("/my-tasks", response_model=list[TaskOut])
def my_tasks(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return PmsRatingService(db, company_id).my_tasks(current_user.employee_id)


@router.get("/assignments/{assignment_id}", response_model=TaskDetailOut)
def task_detail(
    assignment_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    return _call(PmsRatingService(db, company_id).task_detail,
                 assignment_id, current_user.employee_id)


@router.post("/assignments/{assignment_id}/submit", status_code=201)
def submit_ratings(
    assignment_id: UUID, data: SubmitRatings,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    _call(PmsRatingService(db, company_id).submit, assignment_id, current_user.employee_id,
          [i.model_dump() for i in data.ratings])
    return {"status": "submitted"}


# ── Reviewer (for employees without a manager) ───────────────
@router.put("/cycles/{cycle_id}/participants/{employee_id}/reviewer", status_code=204)
def set_reviewer(
    cycle_id: UUID, employee_id: UUID, data: ReviewerSet,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    _call(PmsAssignmentService(db, company_id).set_reviewer,
          cycle_id, employee_id, data.reviewer_id, current_user.employee_id)


# ── Admin: completion + scores ───────────────────────────────
@router.get("/cycles/{cycle_id}/completion", response_model=list[CompletionOut])
def completion(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsRatingService(db, company_id).completion, cycle_id)


@router.post("/cycles/{cycle_id}/scores/compute")
def compute_scores(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    n = _call(PmsRatingService(db, company_id).recompute, current_user.employee_id, cycle_id)
    return {"scored": n}


@router.get("/cycles/{cycle_id}/scores", response_model=list[ScoreOut])
def list_scores(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_admin_role()),
):
    rows = _call(PmsRatingService(db, company_id).list_scores, cycle_id)
    return [ScoreOut(
        employee_id=p.employee_id,
        employee_name=p.employee.full_name if p.employee else None,
        status=p.status, goals_score=p.goals_score, competency_score=p.competency_score,
        self_avg=p.self_avg, manager_avg=p.manager_avg, peer_avg=p.peer_avg,
        peer_response_count=p.peer_response_count,
        peer_score_insufficient=p.peer_score_insufficient,
        final_score=p.final_score, final_rating_label=p.final_rating_label,
        parameter_breakdown=p.parameter_breakdown) for p in rows]
