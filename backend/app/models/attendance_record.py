"""AttendanceRecord model — clock-in/out with source and location tracking."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class AttendanceRecord(Base, TimestampMixin):
    __tablename__ = "attendance_record"

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
        index=True,
    )
    clock_in: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    clock_out: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="web"
    )  # web, mobile, biometric
    location: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # "lat,lng" — PostGIS upgrade path later
    summary: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )  # Optional day summary / work notes

    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee", back_populates="attendance_records")
