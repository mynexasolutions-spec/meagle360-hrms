"""HelpdeskTicket / HelpdeskTicketReply — employee-raised requests with a
threaded reply conversation. Manager visibility is scoped to their direct
reports (Employee.manager_id); Admin sees every ticket in the company.
Reply attribution (who replied) is intentionally NOT filtered out at the
model layer — the employee-facing vs staff-facing response schemas decide
what to expose (see schemas/helpdesk.py)."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class HelpdeskTicket(Base, TimestampMixin):
    __tablename__ = "helpdesk_ticket"

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
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open"
    )  # open, in_progress, resolved, closed
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee = relationship("Employee", foreign_keys=[employee_id])
    replies = relationship(
        "HelpdeskTicketReply", back_populates="ticket",
        cascade="all, delete-orphan", order_by="HelpdeskTicketReply.created_at",
    )


class HelpdeskTicketReply(Base, TimestampMixin):
    __tablename__ = "helpdesk_ticket_reply"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("helpdesk_ticket.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    author_employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    author_role: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    ticket = relationship("HelpdeskTicket", back_populates="replies")
    author = relationship("Employee", foreign_keys=[author_employee_id])