"""OfferLetterRecord - stores the input data behind a generated Offer
Letter (not the PDF itself, which is rendered on-the-fly on every
download). employee_id stays nullable because an offer is typically
created before the candidate has an Employee row; HR can link it later
once the candidate is actually onboarded."""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class OfferLetterRecord(Base, TimestampMixin):
    __tablename__ = "offer_letter_record"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    candidate_name: Mapped[str] = mapped_column(String(255), nullable=False)
    candidate_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    designation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("designation.id", ondelete="SET NULL"), nullable=True,
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("department.id", ondelete="SET NULL"), nullable=True,
    )
    reporting_to_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True,
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("site.id", ondelete="SET NULL"), nullable=True,
    )

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    employment_type: Mapped[str] = mapped_column(String(20), nullable=False, default="full_time")

    salary_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bonus_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    other_benefits: Mapped[str | None] = mapped_column(Text, nullable=True)

    acceptance_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    hr_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hr_contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True,
    )
    generated_by_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True,
    )

    # ── Relationships ────────────────────────────────────
    designation = relationship("Designation")
    department = relationship("Department")
    reporting_to = relationship("Employee", foreign_keys=[reporting_to_id])
    site = relationship("Site")
    employee = relationship("Employee", foreign_keys=[employee_id])
    generated_by = relationship("Employee", foreign_keys=[generated_by_employee_id])
