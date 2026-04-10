"""
Database Models - SQLAlchemy ORM
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Session(Base):
    __tablename__ = "sessions"
    # 使用可读的字符串 ID，便于前端/日志排查（例如 sess_xxx）
    id = Column(String(64), primary_key=True, default=lambda: f"sess_{uuid.uuid4().hex[:16]}")
    name = Column(String(200), nullable=False, default="New Session")
    # single = 单 Agent；multi = Multi-Agent
    mode = Column(String(20), nullable=False, default="single")
    # metadata 是 SQLAlchemy 的保留名，这里用 metadata_ 映射到列名 "metadata"
    metadata_ = Column("metadata", JSON, nullable=True)
    message_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # 级联删除：删除 Session 时，自动删除其 messages
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"
    id = Column(String(64), primary_key=True, default=lambda: f"msg_{uuid.uuid4().hex[:16]}")
    session_id = Column(String(64), ForeignKey("sessions.id"), index=True)
    # role: user / assistant / system
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    # tool_calls: 记录模型调用工具的结构化信息（可选）
    tool_calls = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    session = relationship("Session", back_populates="messages")
