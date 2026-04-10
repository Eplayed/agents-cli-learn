"""
Team Schemas - Multi-Agent
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class TeamRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    mode: Literal["sequential", "parallel", "supervisor", "groupchat"] = "sequential"
    session_id: Optional[str] = None


class TeamResponse(BaseModel):
    session_id: str
    mode: str
    summary: str
    created_at: datetime
