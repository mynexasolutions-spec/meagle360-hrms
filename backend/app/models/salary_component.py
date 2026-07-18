"""SalaryComponent — a reusable, admin-defined earning or deduction
definition (e.g. HRA, EPF, Professional Tax). Fully dynamic: Admin can
add/edit/disable any component with any name and calculation rule."""

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SalaryComponent(Base, TimestampMixin):
    __tablename__ = "salary_component"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    component_type: Mapped[str] = mapped_column(String(20), nullable=False)  # earning | deduction
    calculation_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # fixed | percent_of_basic | percent_of_gross
    value: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    is_statutory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_taxable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    structure_links = relationship(
        "SalaryStructureComponent", back_populates="component", cascade="all, delete-orphan"
    )
