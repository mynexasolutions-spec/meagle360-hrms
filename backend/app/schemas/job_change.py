"""Pydantic schemas for promotions, demotions and transfers."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class SalaryRevision(BaseModel):
    basic_pay: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    annual_ctc: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)


class JobChangeCreate(BaseModel):
    """Leave a field out to keep it as it is. manager_id null means no manager."""
    action: Literal["promote", "demote", "transfer"]
    effective_date: date
    designation_id: UUID | None = None
    department_id: UUID | None = None
    manager_id: UUID | None = None
    reason: str = Field(default="", max_length=500)
    salary: SalaryRevision | None = None


class ScheduledJobChangeResponse(BaseModel):
    id: UUID
    scheduled: bool
    status: str
    error: str
    action: str
    effective_date: date
    designation: str | None
    department: str | None
    manager: str | None
    salary_revised: bool


class VacancyCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    department_id: UUID
    manager_id: UUID
    job_id: UUID | None = None


class VacancyUpdate(BaseModel):
    job_id: UUID | None


class OrgMove(BaseModel):
    """Where someone should end up, and where the draft thinks they are now."""
    employee_id: UUID
    manager_id: UUID | None
    department_id: UUID | None
    expected_manager_id: UUID | None
    expected_department_id: UUID | None


class OrgPublish(BaseModel):
    moves: list[OrgMove] = Field(min_length=1, max_length=500)

    @field_validator("moves")
    @classmethod
    def _one_move_each(cls, moves):
        if len({m.employee_id for m in moves}) != len(moves):
            raise ValueError("Each employee can appear only once")
        return moves


class JobChangeResponse(BaseModel):
    id: UUID
    change_type: str
    effective_date: date
    from_designation: str | None
    to_designation: str | None
    from_department: str | None
    to_department: str | None
    from_manager: str | None
    to_manager: str | None
    salary_revised: bool
    reason: str | None  # admins only
    actor_name: str | None  # admins only
    created_at: datetime
