"""PayslipLine — a single frozen earning/deduction line on a payslip.
Snapshots the component's name at generation time rather than holding a
live reference, so editing/disabling a SalaryComponent later never changes
historical payslips."""

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class PayslipLine(Base, TimestampMixin):
    __tablename__ = "payslip_line"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payslip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payslip.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    component_name: Mapped[str] = mapped_column(String(150), nullable=False)
    component_type: Mapped[str] = mapped_column(String(20), nullable=False)  # earning | deduction
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_manual_adjustment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    payslip = relationship("Payslip", back_populates="lines")
