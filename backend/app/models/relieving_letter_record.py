"""RelievingLetterRecord - stores the input data behind a generated
Relieving Letter (not the PDF itself, which is rendered on-the-fly on
every download). Keeping this record lets HR see history and regenerate
an identical letter later without retyping the last working date or
custom paragraph."""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class RelievingLetterRecord(Base, TimestampMixin):
    __tablename__ = "relieving_letter_record"

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
    last_working_date: Mapped[date] = mapped_column(Date, nullable=False)
    custom_paragraph: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_by_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee", foreign_keys=[employee_id])
    generated_by = relationship("Employee", foreign_keys=[generated_by_employee_id])
