"""PMS audit helper — append-only writes to pms_audit_log.

Caller owns the surrounding transaction (this only adds to the session),
matching app.services.audit_service.log_action."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.pms import PmsAuditLog


def pms_log(
    db: Session,
    company_id: UUID,
    actor_employee_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    cycle_id: UUID | None = None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    reason: str | None = None,
) -> None:
    db.add(PmsAuditLog(
        company_id=company_id,
        cycle_id=cycle_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_value=old_value,
        new_value=new_value,
        reason=reason,
        actor_employee_id=actor_employee_id,
    ))
