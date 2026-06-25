"""
Chat Schemas
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class ImageAttachment(BaseModel):
    """图片附件（Base64 编码）"""
    data: str = Field(..., description="图片 Base64 数据（不含 data:image/... 前缀）")
    media_type: str = Field(default="image/png", description="MIME 类型：image/png, image/jpeg, image/gif, image/webp")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    images: Optional[list[ImageAttachment]] = Field(None, description="附带图片列表（最多 3 张，每张 Base64 < 4MB）")
    session_id: Optional[str] = None
    model: Optional[str] = Field(None, description="指定 LLM 模型名称，不传则用服务端默认值")
    agent_key: Optional[str] = Field(None, description="指定 Agent 类型（如 basic-chatbot / tool-agent / mcp-agent），不传则用默认 MCP Agent")
    stream: bool = True
    idempotency_key: Optional[str] = Field(None, description="幂等键：相同 key 的重复请求直接返回上次结果，不重复执行。推荐用 UUID")


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
