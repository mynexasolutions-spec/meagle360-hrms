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
    action_type: str = Field(
        ...,
        description="'approve_leave', 'apply_leave', or 'finalize_payroll'",
    )
    title: str
    leave_request_id: str | None = None
    employee_name: str | None = None
    employee_code: str | None = None
    department: str | None = None
    leave_type_id: str | None = None
    leave_type_name: str = "Leave"
    start_date: str | None = None
    end_date: str | None = None
    days: int = 1
    available_balance: float | None = None
    reason: str | None = None
    intended_decision: str | None = None
    leave_type_options: list[dict[str, Any]] = Field(default_factory=list)
    # Payroll action card fields
    payroll_run_id: str | None = None
    month: int | None = None
    year: int | None = None
    month_label: str | None = None
    payroll_status: str | None = None
    payslip_count: int | None = None
    total_gross_earnings: float | None = None
    total_deductions: float | None = None
    total_net_pay: float | None = None
    unassigned_employees_count: int | None = None


class AIQuotaResponse(BaseModel):
    is_demo: bool = True
    daily_limit: int | None = 10
    chats_today: int = 0
    chats_remaining: int | None = 10
    limit_reached: bool = False
    resets_at: str = "12:00 AM IST"


class AIChatResponse(BaseModel):
    reply: str
    tools_used: list[str] = Field(default_factory=list)
    pending_actions: list[AIActionCard] = Field(default_factory=list)
    role_mode: str = "admin"
    provider: str = "groq"
    mode: str = "llm"
    quota: AIQuotaResponse | None = None


class AIExecuteActionRequest(BaseModel):
    action_type: str = Field(
        ...,
        description="'approve_leave', 'apply_leave', or 'finalize_payroll'",
    )
    # For approve_leave:
    leave_request_id: str | None = None
    decision: str | None = Field(default="approved", description="'approved' or 'rejected'")
    # For apply_leave:
    leave_type_id: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    reason: str | None = None
    # For finalize_payroll:
    payroll_run_id: str | None = None
    month: int | None = None
    year: int | None = None


class AIExecuteActionResponse(BaseModel):
    status: str
    message: str
    action_type: str
    data: dict[str, Any] = Field(default_factory=dict)


class AITranscribeResponse(BaseModel):
    text: str

