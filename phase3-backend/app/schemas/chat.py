"""
Chat Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    stream: bool = True


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    content: str
    created_at: datetime


class SessionCreate(BaseModel):
    name: Optional[str] = None


class SessionInfo(BaseModel):
    id: str
    name: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class SessionSummary(SessionInfo):
    last_message_preview: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_role: Optional[str] = None
