"""EmployeeShift model — junction table assigning shifts to employees."""

import uuid
from datetime import date as date_type

from sqlalchemy import Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EmployeeShift(Base, TimestampMixin):
    __tablename__ = "employee_shift"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    shift_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("shift.id", ondelete="CASCADE"),
        nullable=False,
    )
    effective_from: Mapped[date_type] = mapped_column(Date, nullable=False)

    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee", back_populates="employee_shifts")
    shift = relationship("Shift", back_populates="employee_shifts")
