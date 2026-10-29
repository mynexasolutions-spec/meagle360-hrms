"""AI Assistant routes — role-aware natural language chat, Whisper voice transcription,
daily digest, and interactive action execution (Leave Apply & Leave Approval)."""

from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models.company import Company
from app.models.user_account import UserAccount
from app.schemas.ai import (
    AIChatRequest,
    AIChatResponse,
    AIExecuteActionRequest,
    AIExecuteActionResponse,
    AIQuotaResponse,
    AITranscribeResponse,
)
from app.services.ai.agent_service import AIAgentService
from app.services.ai.llm_client import LLMClient, LLMProviderError
from app.services.ai.quota_service import (
    enforce_ai_role_access,
    enforce_chat_quota,
    get_user_chat_quota,
    record_chat_usage,
)
from app.services.ai.tools import AIToolbox, get_ist_today
from app.services.leave_service import LeaveService
from app.services.payroll_service import PayrollService

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


def is_admin_or_manager(current_user: UserAccount) -> bool:
    """Return True only for Organization Admins and Managers (excludes standard Employees)."""
    role_names = {r.name.strip().lower() for r in current_user.all_roles if r and r.name}
    if role_names & {"admin", "hr manager", "manager"}:
        return True

    perms = current_user.merged_permissions or {}
    admin_manager_keys = (
        "attendance:approve",
        "leave:approve",
        "settings:write",
        "payroll:read",
        "payroll:write",
    )
    return any(bool(perms.get(k)) for k in admin_manager_keys)


@router.post("/chat", response_model=AIChatResponse)
def chat_with_assistant(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Process a natural-language HR query using role-scoped tools (Admin/Manager vs Employee)."""
    company = db.query(Company).filter(Company.id == company_id).first()
    enforce_ai_role_access(current_user, company)
    enforce_chat_quota(db, current_user, company)

    admin_mode = is_admin_or_manager(current_user)
    agent = AIAgentService(
        db=db,
        company_id=company_id,
        employee_id=current_user.employee_id,
        is_admin_or_manager=admin_mode,
    )
    history_dicts = [{"role": h.role, "content": h.content} for h in payload.history]
    result = agent.chat(user_message=payload.message, history=history_dicts)

    # Record usage towards daily quota
    record_chat_usage(db, company_id=company_id, user_id=current_user.id, message_type="chat")
    quota = get_user_chat_quota(db, current_user, company)

    return AIChatResponse(**result, quota=quota)


@router.post("/execute-action", response_model=AIExecuteActionResponse)
def execute_ai_action(
    payload: AIExecuteActionRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Execute a user-confirmed AI action card (Apply Leave, Approve/Reject Leave, Finalize Payroll)."""
    leave_svc = LeaveService(db, company_id)

    if payload.action_type == "apply_leave":
        if not payload.leave_type_id or not payload.start_date or not payload.end_date:
            raise HTTPException(
                status_code=400,
                detail="Leave type, start date, and end date are required to apply for leave.",
            )
        try:
            s_date = date.fromisoformat(payload.start_date[:10])
            e_date = date.fromisoformat(payload.end_date[:10])
            lt_uuid = UUID(str(payload.leave_type_id))
            req = leave_svc.request_leave(
                current_user.employee_id,
                {
                    "leave_type_id": lt_uuid,
                    "start_date": s_date,
                    "end_date": e_date,
                },
            )
            lt_name = req.leave_type.name if req.leave_type else "Leave"
            days = (e_date - s_date).days + 1
            return AIExecuteActionResponse(
                status="completed",
                action_type="apply_leave",
                message=(
                    f"Your {lt_name} request from {s_date.strftime('%d %b %Y')} to "
                    f"{e_date.strftime('%d %b %Y')} ({days} day(s)) has been submitted for approval!"
                ),
                data={
                    "request_id": str(req.id),
                    "leave_type_name": lt_name,
                    "start_date": s_date.isoformat(),
                    "end_date": e_date.isoformat(),
                    "days": days,
                    "status": req.status,
                },
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    if payload.action_type == "approve_leave":
        if not is_admin_or_manager(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Organization Admins and Managers can approve or reject leave requests.",
            )
        if not payload.leave_request_id:
            raise HTTPException(status_code=400, detail="leave_request_id is required.")

        decision = (payload.decision or "approved").lower().strip()
        if decision not in ("approved", "rejected"):
            raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'.")

        try:
            req_uuid = UUID(str(payload.leave_request_id))
            updated = leave_svc.approve_reject(req_uuid, decision, current_user.employee_id)
            if not updated:
                raise HTTPException(status_code=404, detail="Leave request not found.")
            emp_name = updated.employee.full_name if updated.employee else "Employee"
            lt_name = updated.leave_type.name if updated.leave_type else "Leave"
            return AIExecuteActionResponse(
                status="completed",
                action_type="approve_leave",
                message=(
                    f"{emp_name}'s {lt_name} ({updated.start_date.strftime('%d %b %Y')} – "
                    f"{updated.end_date.strftime('%d %b %Y')}) has been {decision}!"
                ),
                data={
                    "request_id": str(updated.id),
                    "employee_name": emp_name,
                    "leave_type_name": lt_name,
                    "decision": decision,
                },
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    if payload.action_type == "finalize_payroll":
        if not is_admin_or_manager(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Organization Admins and HR Managers can finalize payroll runs.",
            )
        if not payload.payroll_run_id:
            raise HTTPException(status_code=400, detail="payroll_run_id is required.")

        try:
            payroll_svc = PayrollService(db, company_id)
            run_uuid = UUID(str(payload.payroll_run_id))
            finalized_run = payroll_svc.finalize_run(run_uuid, current_user.employee_id)
            if not finalized_run:
                raise HTTPException(status_code=404, detail="Payroll run not found.")
            month_label = date(finalized_run.year, finalized_run.month, 1).strftime("%B %Y")
            return AIExecuteActionResponse(
                status="completed",
                action_type="finalize_payroll",
                message=(
                    f"Payroll run for {month_label} has been finalized! "
                    "All payslips are now locked and published for employees."
                ),
                data={
                    "payroll_run_id": str(finalized_run.id),
                    "month": finalized_run.month,
                    "year": finalized_run.year,
                    "status": finalized_run.status,
                },
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    raise HTTPException(status_code=400, detail=f"Unsupported action_type: {payload.action_type}")


@router.post("/transcribe", response_model=AITranscribeResponse)
async def transcribe_voice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Transcribe recorded audio (Hindi / Hinglish / English) via Groq Whisper."""
    company = db.query(Company).filter(Company.id == company_id).first()
    enforce_ai_role_access(current_user, company)
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")
    if len(audio_bytes) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large (max 15 MB).")

    llm = LLMClient()
    try:
        transcript = llm.transcribe(
            audio_bytes=audio_bytes,
            filename=file.filename or "voice.webm",
            content_type=file.content_type or "audio/webm",
        )
    except LLMProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    return AITranscribeResponse(text=transcript)


@router.get("/daily-digest")
def get_daily_digest(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Role-aware live daily snapshot for the AI Assistant header and Hero pills."""
    enforce_ai_role_access(
        current_user, db.query(Company).filter(Company.id == company_id).first()
    )
    admin_mode = is_admin_or_manager(current_user)
    toolbox = AIToolbox(
        db=db,
        company_id=company_id,
        employee_id=current_user.employee_id,
        is_admin_or_manager=admin_mode,
    )
    today = get_ist_today()
    today_iso = today.isoformat()
    llm = LLMClient()

    company = db.query(Company).filter(Company.id == company_id).first()
    quota = get_user_chat_quota(db, current_user, company)

    if not admin_mode:
        leave_summary = toolbox.get_my_leave_summary(year=today.year)
        att_summary = toolbox.get_my_attendance_summary(month=today.month, year=today.year)
        return {
            "role_mode": "employee",
            "date": today_iso,
            "date_formatted": today.strftime("%d %b %Y (%A)"),
            "departments": [],
            "summary": {
                "my_leave_balance": leave_summary.get("total_remaining_paid_leaves", 0),
                "my_pending_leaves": leave_summary.get("pending_requests_count", 0),
                "my_days_present": att_summary.get("summary", {}).get("days_present", 0),
                "my_late_days": att_summary.get("summary", {}).get("late_days_count", 0),
            },
            "llm_configured": llm.is_configured,
            "provider": llm.provider,
            "model": llm.model if llm.is_configured else "local-db-engine",
            "quota": quota,
        }

    attendance = toolbox.get_daily_attendance(target_date=today_iso)
    late = toolbox.get_late_comers(target_date=today_iso)
    approvals = toolbox.get_pending_approvals(attach_action_cards=False)

    return {
        "role_mode": "admin",
        "date": attendance["date"],
        "date_formatted": attendance["date_formatted"],
        "departments": toolbox.list_departments(),
        "summary": {
            **attendance["summary"],
            "late_count": late["late_count"],
            "late_today": late["late_count"],
            "pending_leaves_count": approvals["pending_leave_requests_count"],
            "pending_leave_approvals": approvals["pending_leave_requests_count"],
            "pending_regularizations_count": approvals["pending_regularizations_count"],
        },
        "llm_configured": llm.is_configured,
        "provider": llm.provider,
        "model": llm.model if llm.is_configured else "local-db-engine",
        "quota": quota,
    }


@router.get("/quota", response_model=AIQuotaResponse)
def get_ai_chat_quota(
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(get_current_user),
):
    """Return the current user's daily AI chat usage and quota."""
    company = db.query(Company).filter(Company.id == company_id).first()
    return get_user_chat_quota(db, current_user, company)
