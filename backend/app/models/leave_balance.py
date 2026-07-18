"""LeaveBalance model — tracks remaining leave per employee per year."""

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class LeaveBalance(Base, TimestampMixin):
    __tablename__ = "leave_balance"

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
    )
    leave_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leave_type.id", ondelete="CASCADE"),
        nullable=False,
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=0)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee", back_populates="leave_balances")
    leave_type = relationship("LeaveType", back_populates="leave_balances")
