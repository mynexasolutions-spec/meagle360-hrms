"""ProfessionalTaxSlab — admin-configurable Professional Tax slabs per
state. Only states that levy PT need slabs configured; a state with no
slabs configured simply means PT doesn't apply to employees there."""

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ProfessionalTaxSlab(Base, TimestampMixin):
    __tablename__ = "professional_tax_slab"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    min_gross: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    max_gross: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)  # null = no upper bound
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    company = relationship("Company")
