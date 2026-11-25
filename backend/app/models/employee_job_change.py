"""Job history: one row per promotion, demotion, transfer or manager change.

Names are stored as they were at the time, so later renames do not rewrite history.
"""

import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EmployeeJobChange(Base, TimestampMixin):
    __tablename__ = "employee_job_change"
    __table_args__ = (
        CheckConstraint(
            "change_type IN ('assigned', 'promotion', 'demotion', 'role_change', 'transfer', 'manager_change')",
            name="ck_employee_job_change_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True)
    change_type: Mapped[str] = mapped_column(String(20), nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    from_designation: Mapped[str | None] = mapped_column(String(150))
    to_designation: Mapped[str | None] = mapped_column(String(150))
    from_department: Mapped[str | None] = mapped_column(String(255))
    to_department: Mapped[str | None] = mapped_column(String(255))
    from_manager: Mapped[str | None] = mapped_column(String(255))
    to_manager: Mapped[str | None] = mapped_column(String(255))
    salary_revised: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    actor_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)

    actor = relationship("Employee", foreign_keys=[actor_employee_id])
