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
    id = Column(String(64), primary_key=True, default=lambda: f"sess_{uuid.uuid4().hex[:16]}")
    name = Column(String(200), nullable=False, default="New Session")
    mode = Column(String(20), nullable=False, default="single")
    metadata_ = Column("metadata", JSON, nullable=True)
    message_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"
    id = Column(String(64), primary_key=True, default=lambda: f"msg_{uuid.uuid4().hex[:16]}")
    session_id = Column(String(64), ForeignKey("sessions.id"), index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    tool_calls = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    session = relationship("Session", back_populates="messages")
