"""Pydantic schemas for Department."""

from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class DepartmentCreate(BaseModel):
    name: str
    parent_department_id: UUID | None = None


class DepartmentUpdate(BaseModel):
    name: str | None = None
    parent_department_id: UUID | None = None


class DepartmentResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    parent_department_id: UUID | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepartmentTreeNode(BaseModel):
    id: UUID
    name: str
    children: list["DepartmentTreeNode"] = []

    class Config:
        from_attributes = True
