"""Audit log routes — Admin-only read access."""

from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_company_id, require_permissions
from app.models.user_account import UserAccount
from app.repositories.audit_log_repo import AuditLogRepository
from app.schemas.audit_log import AuditLogResponse

router = APIRouter(prefix="/api/audit-logs", tags=["Audit Log"])


@router.get("/", response_model=list[AuditLogResponse])
def list_audit_logs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    company_id: UUID = Depends(get_company_id),
    _: UserAccount = Depends(require_permissions("settings:write")),
):
    repo = AuditLogRepository(db, company_id)
    logs = repo.get_recent(skip, limit)
    return [
        AuditLogResponse(
            id=log.id,
            actor_name=log.actor.full_name if log.actor else "System",
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details or {},
            created_at=log.created_at,
        )
        for log in logs
    ]
