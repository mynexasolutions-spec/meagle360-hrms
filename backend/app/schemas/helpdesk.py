"""Pydantic schemas for the HR Helpdesk module.

TicketReplyEmployeeOut never carries who wrote the reply;
TicketReplyStaffOut does. Both come from the same row — split happens
at serialization, not storage.
"""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class TicketCreate(BaseModel):
    category: str
    subject: str = Field(..., max_length=200)
    description: str


class TicketStatusUpdate(BaseModel):
    status: str


class ReplyCreate(BaseModel):
    message: str


class TicketReplyEmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    message: str
    created_at: datetime
    author_role: str | None = None
    author_name: str | None = None


class TicketReplyStaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    message: str
    created_at: datetime
    author_employee_id: UUID
    author_name: str | None = None
    author_role: str


class TicketEmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    employee_id: UUID
    category: str
    subject: str
    description: str
    status: str
    created_at: datetime
    closed_at: datetime | None = None
    replies: list[TicketReplyEmployeeOut] = []


class TicketStaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    employee_id: UUID
    employee_name: str | None = None
    category: str
    subject: str
    description: str
    status: str
    created_at: datetime
    closed_at: datetime | None = None
    replies: list[TicketReplyStaffOut] = []