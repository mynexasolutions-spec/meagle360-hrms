"""Department model — supports self-referencing parent hierarchy."""

import uuid
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Department(Base, TimestampMixin):
    __tablename__ = "department"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("department.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="departments")
    parent = relationship("Department", remote_side="Department.id", back_populates="children")
    children = relationship("Department", back_populates="parent")
    employees = relationship("Employee", back_populates="department")
