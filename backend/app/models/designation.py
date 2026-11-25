"""Designation model — company-scoped job title lookup, used on payslips,
offer letters, and relieving letters."""

import uuid
from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Designation(Base, TimestampMixin):
    __tablename__ = "designation"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    # Higher is more senior; decides whether a change is a promotion or a demotion.
    level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="designations")
    employees = relationship("Employee", back_populates="designation")
