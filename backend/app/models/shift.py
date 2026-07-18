"""Shift model — defines shift templates (fixed, rotational, flexible)."""

import uuid
from datetime import time

from sqlalchemy import ForeignKey, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Shift(Base, TimestampMixin):
    __tablename__ = "shift"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_type: Mapped[str] = mapped_column(String(50), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="shifts")
    employee_shifts = relationship("EmployeeShift", back_populates="shift", cascade="all, delete-orphan")
