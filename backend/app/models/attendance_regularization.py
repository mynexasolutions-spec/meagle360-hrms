"""AttendanceRegularization model — employee-submitted correction requests
for a day's attendance, subject to manager/admin approval."""

import uuid
from datetime import date as date_type, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class AttendanceRegularization(Base, TimestampMixin):
    __tablename__ = "attendance_regularization"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    record_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    requested_clock_in: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    requested_clock_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending, approved, rejected
    reviewed_by_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True,
    )

    employee = relationship("Employee", foreign_keys=[employee_id])
    reviewed_by = relationship("Employee", foreign_keys=[reviewed_by_employee_id])
