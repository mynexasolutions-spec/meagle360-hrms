"""EmployeeSalaryAssignment — links an employee to a SalaryStructure with
their own Basic Pay, effective from a given date. Multiple rows per
employee over time support raises/revisions without losing history; the
"current" assignment is the latest one with effective_from <= today."""

import uuid
from datetime import date as date_type
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EmployeeSalaryAssignment(Base, TimestampMixin):
    __tablename__ = "employee_salary_assignment"

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
    salary_structure_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("salary_structure.id", ondelete="SET NULL"),
        nullable=True,
    )
    annual_ctc: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    basic_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    effective_from: Mapped[date_type] = mapped_column(Date, nullable=False)

    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee")
    salary_structure = relationship("SalaryStructure", back_populates="assignments")
