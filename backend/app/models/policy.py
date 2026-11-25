"""Company policies: an editable working copy, immutable published versions,
and who agreed to which version."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


def _pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _fk(target: str, ondelete: str = "CASCADE", nullable: bool = False, index: bool = True):
    return mapped_column(
        UUID(as_uuid=True), ForeignKey(target, ondelete=ondelete), nullable=nullable, index=index)


def _now():
    return mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class CompanyPolicy(Base, TimestampMixin):
    __tablename__ = "company_policy"
    __table_args__ = (
        UniqueConstraint("company_id", "template_key", name="uq_company_policy_template"),
        CheckConstraint("status IN ('draft', 'published', 'hidden', 'deleted')", name="ck_company_policy_status"),
    )

    id: Mapped[uuid.UUID] = _pk()
    company_id: Mapped[uuid.UUID] = _fk("company.id")
    template_key: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Working copy. Employees only ever see a CompanyPolicyVersion.
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    attachment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    requires_ack: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    published_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Agreeing to this version or a later one counts as up to date.
    ack_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class CompanyPolicyVersion(Base):
    __tablename__ = "company_policy_version"
    __table_args__ = (UniqueConstraint("policy_id", "version", name="uq_company_policy_version"),)

    id: Mapped[uuid.UUID] = _pk()
    policy_id: Mapped[uuid.UUID] = _fk("company_policy.id")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    published_by_employee_id: Mapped[uuid.UUID | None] = _fk("employee.id", "SET NULL", True, False)
    published_at: Mapped[datetime] = _now()


class CompanyPolicyFile(Base):
    """A PDF. Never changed once stored, so an old version keeps its own file."""
    __tablename__ = "company_policy_file"

    id: Mapped[uuid.UUID] = _pk()
    policy_id: Mapped[uuid.UUID] = _fk("company_policy.id")
    filename: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    created_at: Mapped[datetime] = _now()


class CompanyPolicyAck(Base):
    __tablename__ = "company_policy_ack"
    __table_args__ = (
        UniqueConstraint("policy_id", "employee_id", "version", name="uq_company_policy_ack"),
    )

    id: Mapped[uuid.UUID] = _pk()
    policy_id: Mapped[uuid.UUID] = _fk("company_policy.id")
    employee_id: Mapped[uuid.UUID] = _fk("employee.id")
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    acknowledged_at: Mapped[datetime] = _now()
