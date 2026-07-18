"""
SQLAlchemy declarative base and reusable mixins.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base for all models."""
    pass


class TimestampMixin:
    """Adds created_at / updated_at audit columns to any model."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class CompanyScopedMixin:
    """Adds company_id FK to any model for multi-tenant scoping."""

    @classmethod
    def _company_id_column(cls):
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("company.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
