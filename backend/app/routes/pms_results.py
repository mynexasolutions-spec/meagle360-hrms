"""PMS routes — Phase 4 & 5: finalize, release, close, score adjustment,
results (me / team / company), rating history, audit logs, and payroll revisions."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user, require_admin_role
from app.models.pms import ReviewParticipant
from app.models.user_account import UserAccount
from app.routes.pms import _call
from app.schemas.pms import (
    CompanyResultsOut, CycleOut, HistoryEntryOut, ParticipantResultOut,
    PayrollRevisionApprove, PayrollRevisionOut, PayrollRevisionReject,
    PmsAuditLogOut, ScoreAdjustRequest,
)
from app.services.pms_payroll_service import PmsPayrollService
from app.services.pms_results_service import PmsResultsService, effective_score_of

router = APIRouter(prefix="/api/pms", tags=["PMS"])


def _is_admin(user: UserAccount) -> bool:
    return any(r.name == "Admin" for r in user.all_roles)


def _to_result_out(p: ReviewParticipant) -> ParticipantResultOut:
    return ParticipantResultOut(
        employee_id=p.employee_id,
        employee_name=p.employee.full_name if p.employee else None,
        status=p.status,
        goals_score=p.goals_score,
        competency_score=p.competency_score,
        self_avg=p.self_avg,
        manager_avg=p.manager_avg,
        peer_avg=p.peer_avg,
        peer_response_count=p.peer_response_count,
        peer_score_insufficient=p.peer_score_insufficient,
        final_score=p.final_score,
        adjusted_score=p.adjusted_score,
        effective_score=effective_score_of(p),
        adjustment_reason=p.adjustment_reason,
        final_rating_label=p.final_rating_label,
        attendance_snapshot=p.attendance_snapshot,
        parameter_breakdown=p.parameter_breakdown,
        locked_at=p.locked_at,
        released_at=p.released_at,
    )


# ── Lifecycle: finalize / release / close ────────────────────
@router.post("/cycles/{cycle_id}/finalize", response_model=CycleOut)
def finalize_cycle(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsResultsService(db, company_id).finalize_cycle,
                 current_user.employee_id, cycle_id)


@router.post("/cycles/{cycle_id}/release", response_model=CycleOut)
def release_cycle(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsResultsService(db, company_id).release_cycle,
                 current_user.employee_id, cycle_id)


@router.post("/cycles/{cycle_id}/close", response_model=CycleOut)
def close_cycle(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    return _call(PmsResultsService(db, company_id).close_cycle,
                 current_user.employee_id, cycle_id)


# ── Review-window adjustment ─────────────────────────────────
@router.put(
    "/cycles/{cycle_id}/participants/{employee_id}/adjust-score",
    response_model=ParticipantResultOut,
)
def adjust_score(
    cycle_id: UUID, employee_id: UUID, data: ScoreAdjustRequest,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    part = _call(
        PmsResultsService(db, company_id).adjust_score,
        cycle_id, employee_id, data.adjusted_score, data.reason,
        current_user.employee_id, _is_admin(current_user),
    )
    return _to_result_out(part)


# ── Results (me / team / company) ────────────────────────────
@router.get("/cycles/{cycle_id}/results/me", response_model=ParticipantResultOut)
def my_result(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    part = _call(PmsResultsService(db, company_id).my_result,
                 cycle_id, current_user.employee_id)
    return _to_result_out(part)


@router.get("/cycles/{cycle_id}/results/team", response_model=list[ParticipantResultOut])
def team_results(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    parts = _call(PmsResultsService(db, company_id).team_results,
                  cycle_id, current_user.employee_id, _is_admin(current_user))
    return [_to_result_out(p) for p in parts]


@router.get("/cycles/{cycle_id}/results/company", response_model=CompanyResultsOut)
def company_results(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_admin_role()),
):
    res = _call(PmsResultsService(db, company_id).company_results, cycle_id)
    return CompanyResultsOut(
        cycle_id=res["cycle_id"],
        cycle_name=res["cycle_name"],
        status=res["status"],
        participant_count=res["participant_count"],
        average_score=res["average_score"],
        distribution=res["distribution"],
        participants=[_to_result_out(p) for p in res["participants"]],
    )


# ── Rating history ───────────────────────────────────────────
@router.get("/history/me", response_model=list[HistoryEntryOut])
def my_history(
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    if not current_user.employee_id:
        return []
    rows = _call(
        PmsResultsService(db, company_id).history,
        current_user.employee_id, current_user.employee_id, _is_admin(current_user),
    )
    return [
        HistoryEntryOut(
            cycle_id=c.id, cycle_name=c.name, start_date=c.start_date, end_date=c.end_date,
            goals_score=p.goals_score, competency_score=p.competency_score,
            effective_score=effective_score_of(p), final_rating_label=p.final_rating_label,
            released_at=p.released_at,
        )
        for p, c in rows
    ]


@router.get("/history/{employee_id}", response_model=list[HistoryEntryOut])
def employee_history(
    employee_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    rows = _call(
        PmsResultsService(db, company_id).history,
        employee_id, current_user.employee_id, _is_admin(current_user),
    )
    return [
        HistoryEntryOut(
            cycle_id=c.id, cycle_name=c.name, start_date=c.start_date, end_date=c.end_date,
            goals_score=p.goals_score, competency_score=p.competency_score,
            effective_score=effective_score_of(p), final_rating_label=p.final_rating_label,
            released_at=p.released_at,
        )
        for p, c in rows
    ]


# ── Audit log ────────────────────────────────────────────────
@router.get("/audit-logs", response_model=list[PmsAuditLogOut])
def list_audit_logs(
    cycle_id: UUID | None = None, limit: int = 200,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_admin_role()),
):
    return PmsResultsService(db, company_id).list_audit_logs(cycle_id=cycle_id, limit=min(limit, 500))


# ── Payroll revisions (Admin only) ───────────────────────────
@router.get("/cycles/{cycle_id}/payroll-revisions", response_model=list[PayrollRevisionOut])
def list_payroll_revisions(
    cycle_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_admin_role()),
):
    rows = _call(PmsPayrollService(db, company_id).list_revisions, cycle_id)
    return [PayrollRevisionOut(**r) for r in rows]


@router.post("/ payroll-revisions/{revision_id}/approve".replace(" ", ""))
def approve_payroll_revision(
    revision_id: UUID, data: PayrollRevisionApprove,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    rev = _call(
        PmsPayrollService(db, company_id).approve_revision,
        revision_id,
        current_user.employee_id,
        data.approved_hike_percent,
        data.effective_date,
        data.override_reason,
    )
    return {"id": rev.id, "status": rev.status, "approved_hike_percent": rev.approved_hike_percent}


@router.post("/payroll-revisions/{revision_id}/reject")
def reject_payroll_revision(
    revision_id: UUID, data: PayrollRevisionReject,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    rev = _call(
        PmsPayrollService(db, company_id).reject_revision,
        revision_id, current_user.employee_id, data.reason,
    )
    return {"id": rev.id, "status": rev.status}


@router.post("/payroll-revisions/{revision_id}/apply")
def apply_payroll_revision(
    revision_id: UUID,
    db: Session = Depends(get_db), company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_role()),
):
    rev = _call(
        PmsPayrollService(db, company_id).apply_revision,
        revision_id, current_user.employee_id,
    )
    return {
        "id": rev.id,
        "status": rev.status,
        "salary_assignment_id": rev.salary_assignment_id,
        "new_basic_pay": rev.new_basic_pay,
        "new_annual_ctc": rev.new_annual_ctc,
        "effective_date": rev.effective_date,
    }
