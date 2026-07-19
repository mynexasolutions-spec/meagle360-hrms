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

    # Cost to the company that's never paid to the employee (e.g. Employer
    # PF) — part of CTC, excluded from Gross/Net entirely.
    is_employer_contribution: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # This component's amount is auto-computed as whatever's left of CTC
    # after Basic, employer contributions, and every other fixed/percent
    # earning are accounted for (e.g. "Special Allowance"). At most one
    # such component should be active per structure.
    is_balancing_figure: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # When set, the engine overrides normal fixed/percent calculation with
    # specialized, still fully-configurable rule engines: headcount+ceiling
    # eligibility for epf/esi, state-slab lookup for pt, income-slab
    # calculation for tds. Admin still names/labels the component freely —
    # this only tells the engine which rulebook to apply.
    statutory_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # epf | esi | pt | tds

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    structure_links = relationship(
        "SalaryStructureComponent", back_populates="component", cascade="all, delete-orphan"
    )
