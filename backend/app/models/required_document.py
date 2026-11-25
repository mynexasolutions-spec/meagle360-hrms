"""Documents a company asks its employees for, and the files they upload."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


def _pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _fk(target: str, ondelete: str = "CASCADE", nullable: bool = False, index: bool = True):
    return mapped_column(
        UUID(as_uuid=True), ForeignKey(target, ondelete=ondelete), nullable=nullable, index=index)


class RequiredDocument(Base, TimestampMixin):
    """Empty department_ids / employment_types means everyone; when both are set, both must match."""
    __tablename__ = "required_document"

    id: Mapped[uuid.UUID] = _pk()
    company_id: Mapped[uuid.UUID] = _fk("company.id")
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    instructions: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    mandatory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    department_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    employment_types: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class RequiredDocumentFile(Base):
    """The current file. A new upload replaces the row, so a review can never land on a file HR has not seen."""
    __tablename__ = "required_document_file"
    __table_args__ = (
        UniqueConstraint("required_document_id", "employee_id", name="uq_required_document_file"),
        CheckConstraint("status IN ('uploaded', 'verified', 'rejected')", name="ck_required_document_file_status"),
    )

    id: Mapped[uuid.UUID] = _pk()
    company_id: Mapped[uuid.UUID] = _fk("company.id")
    required_document_id: Mapped[uuid.UUID] = _fk("required_document.id", index=False)
    employee_id: Mapped[uuid.UUID] = _fk("employee.id")
    filename: Mapped[str] = mapped_column(String(200), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    # Private ImageKit file; see document_storage.
    storage_id: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="uploaded")
    review_note: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    uploaded_by_employee_id: Mapped[uuid.UUID | None] = _fk("employee.id", "SET NULL", True, False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    reviewed_by_employee_id: Mapped[uuid.UUID | None] = _fk("employee.id", "SET NULL", True, False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
