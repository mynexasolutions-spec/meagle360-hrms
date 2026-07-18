"""SalaryStructureComponent — join table: which SalaryComponents belong to
a given SalaryStructure."""

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SalaryStructureComponent(Base, TimestampMixin):
    __tablename__ = "salary_structure_component"
    __table_args__ = (
        UniqueConstraint("salary_structure_id", "salary_component_id", name="uq_structure_component"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    salary_structure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("salary_structure.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    salary_component_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("salary_component.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    structure = relationship("SalaryStructure", back_populates="component_links")
    component = relationship("SalaryComponent", back_populates="structure_links")
