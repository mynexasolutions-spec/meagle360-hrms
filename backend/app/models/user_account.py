"""UserAccount model — authentication credentials linked to an employee."""

import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserAccount(Base, TimestampMixin):
    __tablename__ = "user_account"

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
        unique=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("role.id", ondelete="SET NULL"),
        nullable=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # NULL until the invite link's set-password flow is redeemed — the
    # signal used to distinguish "invited, not yet logged in" from "active".
    invite_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ────────────────────────────────────
    employee = relationship("Employee", back_populates="user_account")
    role = relationship("Role", back_populates="user_accounts")
    # Additional roles beyond the primary `role` above — see UserAccountRole.
    role_links = relationship(
        "UserAccountRole", back_populates="user_account", cascade="all, delete-orphan"
    )

    @property
    def all_roles(self) -> list["Role"]:
        """Primary role + any additional roles, deduplicated. For an account
        with only a primary role (the case for every existing account today),
        this returns exactly [self.role] — identical to before multi-role
        support was added."""
        roles_by_id = {}
        if self.role is not None:
            roles_by_id[self.role.id] = self.role
        for link in self.role_links:
            if link.role is not None:
                roles_by_id[link.role.id] = link.role
        return list(roles_by_id.values())

    @property
    def merged_permissions(self) -> dict:
        """Union of permissions across all_roles (True wins). For a
        single-role account this is byte-for-byte the same dict as
        `role.permissions` would give."""
        merged: dict = {}
        for role in self.all_roles:
            for key, value in (role.permissions or {}).items():
                merged[key] = merged.get(key, False) or bool(value)
        return merged
