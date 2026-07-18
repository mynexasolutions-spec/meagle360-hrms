"""Pydantic schemas for Role."""

from uuid import UUID
from pydantic import BaseModel


class RoleResponse(BaseModel):
    id: UUID
    name: str
    permissions: dict

    class Config:
        from_attributes = True
