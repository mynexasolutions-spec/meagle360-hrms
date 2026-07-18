"""Payslip — one employee's frozen result for a PayrollRun. Line-item
detail lives in PayslipLine; totals here are for quick listing/summary."""

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Payslip(Base, TimestampMixin):
    __tablename__ = "payslip"
    __table_args__ = (
        UniqueConstraint("payroll_run_id", "employee_id", name="uq_payslip_run_employee"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    payroll_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payroll_run.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    basic_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    gross_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    gross_deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    working_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    lop_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    lop_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # ── Relationships ────────────────────────────────────
    payroll_run = relationship("PayrollRun", back_populates="payslips")
    employee = relationship("Employee")
    lines = relationship("PayslipLine", back_populates="payslip", cascade="all, delete-orphan")
