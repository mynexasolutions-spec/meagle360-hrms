"""Planned organization changes: job changes waiting for their date, and posts waiting for a person."""

import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, JSON, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


def _fk(target: str, ondelete: str = "CASCADE", nullable: bool = False, index: bool = False):
    return mapped_column(
        UUID(as_uuid=True), ForeignKey(target, ondelete=ondelete), nullable=nullable, index=index)


class ScheduledJobChange(Base, TimestampMixin):
    """payload is the JobChangeCreate request, checked again on the day it is applied."""
    __tablename__ = "scheduled_job_change"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'applied', 'cancelled', 'failed')", name="ck_scheduled_job_change_status"),
        Index("uq_scheduled_job_change_pending", "employee_id", unique=True,
              postgresql_where=text("status = 'pending'"), sqlite_where=text("status = 'pending'")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = _fk("company.id", index=True)
    employee_id: Mapped[uuid.UUID] = _fk("employee.id", index=True)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    created_by_employee_id: Mapped[uuid.UUID | None] = _fk("employee.id", "SET NULL", True)


class VacantPosition(Base, TimestampMixin):
    __tablename__ = "vacant_position"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = _fk("company.id", index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    department_id: Mapped[uuid.UUID | None] = _fk("department.id", "SET NULL", True)
    manager_id: Mapped[uuid.UUID | None] = _fk("employee.id", "SET NULL", True)
    job_id: Mapped[uuid.UUID | None] = _fk("job_openings.id", "SET NULL", True)

    job = relationship("JobOpening")
