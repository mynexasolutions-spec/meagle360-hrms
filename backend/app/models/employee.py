"""Employee model — central entity for all HR operations."""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Employee(Base, TimestampMixin):
    __tablename__ = "employee"
    __table_args__ = (
        # employee_code only needs to be unique within a company, not
        # globally — two different tenants each having their own "EMP001"
        # is expected, not a collision.
        UniqueConstraint("company_id", "employee_code", name="uq_employee_company_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("department.id", ondelete="SET NULL"),
        nullable=True,
    )
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee.id", ondelete="SET NULL"),
        nullable=True,
    )
    site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("site.id", ondelete="SET NULL"),
        nullable=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    employee_code: Mapped[str] = mapped_column(String(50), nullable=False)
    date_of_hire: Mapped[date] = mapped_column(Date, nullable=False)
    employment_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )

    # ── Profile ───────────────────────────────────────────
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    personal_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # ── Relationships ────────────────────────────────────
    company = relationship("Company", back_populates="employees")
    department = relationship("Department", back_populates="employees")
    site = relationship("Site", back_populates="employees")
    manager = relationship("Employee", remote_side="Employee.id", back_populates="direct_reports")
    direct_reports = relationship("Employee", back_populates="manager")
    user_account = relationship("UserAccount", back_populates="employee", uselist=False)
    documents = relationship("EmployeeDocument", back_populates="employee", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="employee", cascade="all, delete-orphan")
    leave_balances = relationship("LeaveBalance", back_populates="employee", cascade="all, delete-orphan")
    leave_requests = relationship("LeaveRequest", back_populates="employee", cascade="all, delete-orphan")
    employee_shifts = relationship("EmployeeShift", back_populates="employee", cascade="all, delete-orphan")
    expense_claims = relationship(
        "ExpenseClaim", back_populates="employee", foreign_keys="ExpenseClaim.employee_id",
        cascade="all, delete-orphan",
    )
