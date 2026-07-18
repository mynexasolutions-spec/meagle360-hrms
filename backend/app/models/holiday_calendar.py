"""HolidayCalendar model — company-specific holiday entries."""

import uuid
from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class HolidayCalendar(Base, TimestampMixin):
    __tablename__ = "holiday_calendar"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    holiday_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="holiday_calendars")
