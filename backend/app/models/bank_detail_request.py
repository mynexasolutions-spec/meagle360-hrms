"""BankDetailRequest — an employee's own PAN / bank account change, which only
reaches the employee record (and so payroll) once HR approves it."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class BankDetailRequest(Base, TimestampMixin):
    __tablename__ = "bank_detail_request"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="CASCADE"), nullable=False, index=True)

    # The values asked for. A field left empty is not being changed.
    pan_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_account_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bank_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Optional proof (cancelled cheque, passbook, PAN card): private ImageKit file.
    proof_filename: Mapped[str | None] = mapped_column(String(200), nullable=True)
    proof_content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    proof_storage_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    proof_storage_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    # pending, approved, rejected, cancelled
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee = relationship("Employee", foreign_keys=[employee_id])
    reviewed_by = relationship("Employee", foreign_keys=[reviewed_by_employee_id])
