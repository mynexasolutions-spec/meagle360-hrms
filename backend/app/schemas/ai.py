"""Pydantic schemas for the Org Admin AI Assistant endpoints."""

from pydantic import BaseModel, Field


class ChatHistoryItem(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatHistoryItem] = Field(default_factory=list)


class AIChatResponse(BaseModel):
    reply: str
    tools_used: list[str] = Field(default_factory=list)
    provider: str = "groq"
    mode: str = "llm"


class AITranscribeResponse(BaseModel):
    text: str
