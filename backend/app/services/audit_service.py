"""Audit logging — lightweight helper called from services at key mutation points."""

from uuid import UUID
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def log_action(
    db: Session,
    company_id: UUID,
    actor_employee_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    details: dict | None = None,
) -> None:
    """Record an audit entry. Caller is responsible for committing the
    surrounding transaction (this just adds to the session)."""
    db.add(AuditLog(
        company_id=company_id,
        actor_employee_id=actor_employee_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
    ))
