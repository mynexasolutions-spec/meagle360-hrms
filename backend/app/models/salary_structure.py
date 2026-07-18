"""SalaryStructure — a named "batch" (e.g. "Engineering L1") that bundles a
set of SalaryComponents. Employees are assigned to a structure; each
employee's own Basic Pay anchors the percentage-based components."""

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SalaryStructure(Base, TimestampMixin):
    __tablename__ = "salary_structure"

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
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    component_links = relationship(
        "SalaryStructureComponent", back_populates="structure", cascade="all, delete-orphan"
    )
    assignments = relationship("EmployeeSalaryAssignment", back_populates="salary_structure")
