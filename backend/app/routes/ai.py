"""AI Assistant routes — natural language chat, Whisper voice transcription, and daily digest."""

from uuid import UUID
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, get_current_user
from app.models.user_account import UserAccount
from app.schemas.ai import AIChatRequest, AIChatResponse, AITranscribeResponse
from app.services.ai.agent_service import AIAgentService
from app.services.ai.llm_client import LLMClient, LLMProviderError
from app.services.ai.tools import AIToolbox, get_ist_today

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])


def require_admin_or_manager(
    current_user: UserAccount = Depends(get_current_user),
) -> UserAccount:
    """Restrict AI Assistant endpoints to Org Admins and Managers only."""
    is_admin = any(r.name == "Admin" for r in current_user.all_roles)
    if is_admin:
        return current_user

    perms = current_user.merged_permissions or {}
    allowed_keys = ("attendance:approve", "leave:approve", "settings:write", "employees:read")
    if any(perms.get(k) for k in allowed_keys):
        return current_user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="AI Assistant is restricted to Organization Admins and Managers.",
    )


@router.post("/chat", response_model=AIChatResponse)
def chat_with_assistant(
    payload: AIChatRequest,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    current_user: UserAccount = Depends(require_admin_or_manager),
):
    """Process a natural-language HR query using read-only company-scoped tools."""
    agent = AIAgentService(db=db, company_id=company_id)
    history_dicts = [{"role": h.role, "content": h.content} for h in payload.history]
    result = agent.chat(user_message=payload.message, history=history_dicts)
    return AIChatResponse(**result)


@router.post("/transcribe", response_model=AITranscribeResponse)
async def transcribe_voice(
    file: UploadFile = File(...),
    current_user: UserAccount = Depends(require_admin_or_manager),
):
    """Transcribe recorded audio (Hindi / Hinglish / English) via Groq Whisper."""
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
    current_user: UserAccount = Depends(require_admin_or_manager),
):
    """Deterministic + AI-ready live daily snapshot for the AI Assistant header."""
    toolbox = AIToolbox(db=db, company_id=company_id)
    today_iso = get_ist_today().isoformat()

    attendance = toolbox.get_daily_attendance(target_date=today_iso)
    late = toolbox.get_late_comers(target_date=today_iso)
    approvals = toolbox.get_pending_approvals()
    llm = LLMClient()

    return {
        "date": attendance["date"],
        "date_formatted": attendance["date_formatted"],
        "departments": toolbox.list_departments(),
        "summary": {
            **attendance["summary"],
            "late_count": late["late_count"],
            "pending_leaves_count": approvals["pending_leave_requests_count"],
            "pending_regularizations_count": approvals["pending_regularizations_count"],
        },
        "llm_configured": llm.is_configured,
        "provider": llm.provider,
        "model": llm.model if llm.is_configured else "local-db-engine",
    }
