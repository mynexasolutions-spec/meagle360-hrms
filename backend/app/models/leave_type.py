"""LeaveType model — configurable leave categories per company."""

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class LeaveType(Base, TimestampMixin):
    __tablename__ = "leave_type"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    accrual_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=0
    )  # days accrued per month
    # Whether taking this leave type protects pay (True) or is treated as
    # loss-of-pay when computing payroll (False) — e.g. "Loss of Pay" leave
    # itself, or an exhausted-balance policy.
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="leave_types")
    leave_balances = relationship("LeaveBalance", back_populates="leave_type", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="leave_type", cascade="all, delete-orphan")
