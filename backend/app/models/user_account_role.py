"""UserAccountRole — many-to-many join enabling an account to hold more
than one role at once (e.g. Manager + HR Manager). The original
`user_account.role_id` column remains the account's primary role and is
left untouched for backward compatibility; this table adds *additional*
roles on top of it. `UserAccount.all_roles` / `merged_permissions` union
the primary role with any rows here."""

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserAccountRole(Base, TimestampMixin):
    __tablename__ = "user_account_role"
    __table_args__ = (
        UniqueConstraint("user_account_id", "role_id", name="uq_user_account_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_account.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("role.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    user_account = relationship("UserAccount", back_populates="role_links")
    role = relationship("Role")
