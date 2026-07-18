"""Company model — the root entity for multi-tenancy."""

import uuid
from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Company(Base, TimestampMixin):
    __tablename__ = "company"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=True)
    multi_entity: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Platform / tenant lifecycle ──────────────────────
    # status: pending_setup (created by Nexa, awaiting admin activation) →
    #         active → suspended / cancelled
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    plan_tier: Mapped[str] = mapped_column(String(50), nullable=False, default="standard")
    seat_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Payroll / attendance policy ──────────────────────
    # Python date.weekday() convention: Monday=0 ... Sunday=6. Used to tell
    # a weekly off apart from an unpaid absence when computing payroll LOP.
    weekly_off_days: Mapped[list[int]] = mapped_column(JSON, default=lambda: [5, 6])

    # ── Relationships ────────────────────────────────────
    departments = relationship("Department", back_populates="company", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="company", cascade="all, delete-orphan")
    roles = relationship("Role", back_populates="company", cascade="all, delete-orphan")
    shifts = relationship("Shift", back_populates="company", cascade="all, delete-orphan")
    holiday_calendars = relationship("HolidayCalendar", back_populates="company", cascade="all, delete-orphan")
    leave_types = relationship("LeaveType", back_populates="company", cascade="all, delete-orphan")
    expense_categories = relationship("ExpenseCategory", back_populates="company", cascade="all, delete-orphan")
    sites = relationship("Site", back_populates="company", cascade="all, delete-orphan")
