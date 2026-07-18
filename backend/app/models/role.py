"""Role model — permissions stored as JSON for flexible RBAC."""

import uuid
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Role(Base, TimestampMixin):
    __tablename__ = "role"

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
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="roles")
    user_accounts = relationship("UserAccount", back_populates="role")
