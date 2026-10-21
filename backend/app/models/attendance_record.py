"""AttendanceRecord model — clock-in/out with source and location tracking."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String
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

    # Geofencing (populated only when the company has geofencing enabled)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    geofence_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # inside, outside, unavailable
    geofence_location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Review of flagged (outside/unavailable) records: pending, approved, rejected
    geofence_review_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, index=True
    )
    geofence_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True
    )
    geofence_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    geofence_review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    clock_out_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    clock_out_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee", back_populates="attendance_records", foreign_keys=[employee_id])
    geofence_reviewer = relationship("Employee", foreign_keys=[geofence_reviewed_by])
