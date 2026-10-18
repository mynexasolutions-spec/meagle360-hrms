"""Pydantic schemas for the Role-Aware Meagle 360 AI Assistant endpoints."""

from typing import Any
from pydantic import BaseModel, Field


class ChatHistoryItem(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatHistoryItem] = Field(default_factory=list)


class AIActionCard(BaseModel):
    action_id: str
    action_type: str = Field(..., description="'approve_leave' or 'apply_leave'")
    title: str
    leave_request_id: str | None = None
    employee_name: str | None = None
    employee_code: str | None = None
    department: str | None = None
    leave_type_id: str | None = None
    leave_type_name: str = "Leave"
    start_date: str
    end_date: str
    days: int = 1
    available_balance: float | None = None
    reason: str | None = None
    intended_decision: str | None = None
    leave_type_options: list[dict[str, Any]] = Field(default_factory=list)


class AIChatResponse(BaseModel):
    reply: str
    tools_used: list[str] = Field(default_factory=list)
    pending_actions: list[AIActionCard] = Field(default_factory=list)
    role_mode: str = "admin"
    provider: str = "groq"
    mode: str = "llm"


class AIExecuteActionRequest(BaseModel):
    action_type: str = Field(..., description="'approve_leave' or 'apply_leave'")
    # For approve_leave:
    leave_request_id: str | None = None
    decision: str | None = Field(default="approved", description="'approved' or 'rejected'")
    # For apply_leave:
    leave_type_id: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    reason: str | None = None


class AIExecuteActionResponse(BaseModel):
    status: str
    message: str
    action_type: str
    data: dict[str, Any] = Field(default_factory=dict)


class AITranscribeResponse(BaseModel):
    text: str

