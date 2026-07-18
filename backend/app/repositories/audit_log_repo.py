"""AuditLog repository — read-only access for the admin audit view."""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from app.models.audit_log import AuditLog
from app.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository[AuditLog]):
    def __init__(self, db: Session, company_id: UUID):
        super().__init__(AuditLog, db, company_id)

    def get_recent(self, skip: int = 0, limit: int = 100):
        return (
            self._scoped_query()
            .options(joinedload(AuditLog.actor))
            .order_by(AuditLog.created_at.desc())
            .offset(skip).limit(limit).all()
        )
