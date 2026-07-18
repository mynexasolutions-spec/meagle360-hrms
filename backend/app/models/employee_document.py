"""EmployeeDocument model — document storage with e-signature tracking."""

import uuid
from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class EmployeeDocument(Base, TimestampMixin):
    __tablename__ = "employee_document"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    doc_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    e_signed: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee", back_populates="documents")
