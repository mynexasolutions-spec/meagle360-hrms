"""FnfSettlement — Full & Final settlement computed at employee exit:
pending salary (pro-rated), leave encashment, gratuity (if eligible),
minus outstanding deductions/loans. Tracked separately from monthly
payroll since it happens once, at separation."""

import uuid
from datetime import date as date_type, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class FnfSettlement(Base, TimestampMixin):
    __tablename__ = "fnf_settlement"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    exit_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    pending_salary_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    leave_encashment_days: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    leave_encashment_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    gratuity_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gratuity_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    outstanding_deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    net_payable: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending | processed
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee = relationship("Employee")
