"""AuditLog model — foundational audit trail of who did what, when."""

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    actor_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "leave.approved"
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "leave_request"
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)

    actor = relationship("Employee")
