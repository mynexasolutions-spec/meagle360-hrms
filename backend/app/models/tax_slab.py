"""TaxSlab — admin-configurable income tax slabs per regime, used to
compute TDS. Nothing about tax rates is hardcoded — Admin defines every
bracket and rate, for both the old and new regimes, and can update them
whenever the government changes them."""

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TaxSlab(Base, TimestampMixin):
    __tablename__ = "tax_slab"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    regime: Mapped[str] = mapped_column(String(10), nullable=False)  # old | new
    min_income: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    max_income: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)  # null = no upper bound
    rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    company = relationship("Company")
