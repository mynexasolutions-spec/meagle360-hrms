"""ActionItem model — tracks tasks/actions assigned to employees with deadlines."""

import uuid
from datetime import date, datetime

from sqlalchemy import ForeignKey, String, Text, Date, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ActionItem(Base, TimestampMixin):
    __tablename__ = "action_item"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    assigned_to_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)  # low, medium, high, urgent
    status: Mapped[str] = mapped_column(String(20), default="todo", nullable=False)  # todo, in_progress, completed, cancelled
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    completion_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company")
    assigned_to = relationship("Employee", foreign_keys=[assigned_to_id])
    created_by = relationship("Employee", foreign_keys=[created_by_id])
