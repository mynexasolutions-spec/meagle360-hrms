"""Company model — the root entity for multi-tenancy."""

import uuid
from decimal import Decimal
from sqlalchemy import Boolean, Integer, Numeric, String
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
    # Cap on how many attendance regularization requests (pending + approved)
    # an employee can submit in a calendar month — admin-configurable so it
    # isn't a hardcoded constant.
    max_monthly_regularizations: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    # ── Statutory policy (India Labour Codes, 2025) — every threshold and
    # rate here is a company-level setting, not hardcoded, since the rollout
    # is uneven across states and continues to change. ────────────────────
    min_basic_percent_of_ctc: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=50)
    epf_threshold_employee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    esi_threshold_employee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    esi_wage_ceiling: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=21000)
    gratuity_threshold_employee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    gratuity_years_regular: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False, default=5)
    gratuity_years_fixed_term: Mapped[Decimal] = mapped_column(Numeric(4, 1), nullable=False, default=1)
    fnf_settlement_days: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    standard_working_hours_per_day: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False, default=8)
    overtime_rate_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False, default=2)
    tds_cess_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=4)
    # Once headcount crosses epf_threshold_employee_count, this flips True
    # and stays True even if headcount later drops — matches how EPF
    # registration works in practice.
    epf_registered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # -- Document branding (Salary Slips, Offer/Relieving Letters) --
    logo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    signature_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    authorized_signatory_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    company_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    footer_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cin_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    registered_address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── Relationships ────────────────────────────────────
    departments = relationship("Department", back_populates="company", cascade="all, delete-orphan")
    designations = relationship("Designation", back_populates="company", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="company", cascade="all, delete-orphan")
    roles = relationship("Role", back_populates="company", cascade="all, delete-orphan")
    shifts = relationship("Shift", back_populates="company", cascade="all, delete-orphan")
    holiday_calendars = relationship("HolidayCalendar", back_populates="company", cascade="all, delete-orphan")
    leave_types = relationship("LeaveType", back_populates="company", cascade="all, delete-orphan")
    expense_categories = relationship("ExpenseCategory", back_populates="company", cascade="all, delete-orphan")
    sites = relationship("Site", back_populates="company", cascade="all, delete-orphan")
