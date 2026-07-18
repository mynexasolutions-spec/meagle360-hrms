"""ExpenseCategory model — configurable expense categories per company."""

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ExpenseCategory(Base, TimestampMixin):
    __tablename__ = "expense_category"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="expense_categories")
    expense_claims = relationship("ExpenseClaim", back_populates="category")
