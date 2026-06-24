"""
Database Models - SQLAlchemy ORM
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Float, DateTime, JSON, ForeignKey
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


# ============================================================
# Agent Run / Event 模型（M10+ 运行持久化层）
#
# 参考 noah-chat-svc 的 agent_run / agent_event / agent_session 设计：
# - AgentRun：一次完整的 Agent 调用（从接收请求到返回结果）
# - AgentEvent：该次调用中的每一个事件（append-only 事件溯源）
#
# 为什么需要这个？
# - 可恢复：中断后能从 DB 恢复上下文继续执行
# - 可审计：每次运行的完整事件链条都在，事后排查方便
# - 可计费：基于 run 级别统计 token 消耗
# - 可回放：前端可以重播历史 run 的事件流
# ============================================================


class AgentRun(Base):
    """一次 Agent 运行的生命周期记录"""
    __tablename__ = "agent_runs"

    id = Column(String(64), primary_key=True, default=lambda: f"run_{uuid.uuid4().hex[:16]}")
    session_id = Column(String(64), ForeignKey("sessions.id"), index=True)
    user_id = Column(String(64), nullable=True, index=True)

    # 幂等键：相同 key 的重复请求直接返回上次结果
    idempotency_key = Column(String(128), nullable=True, unique=True, index=True)

    # Agent 配置
    agent_key = Column(String(50), nullable=True)   # mcp-agent / rag-agent / etc.
    model = Column(String(100), nullable=True)

    # 输入
    prompt = Column(Text, nullable=True)

    # 状态：queued → running → completed / failed / timeout
    status = Column(String(20), nullable=False, default="queued")
    error_message = Column(Text, nullable=True)

    # Token 统计
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)

    # 时间轴
    queued_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    # 关联
    events = relationship("AgentEvent", back_populates="run", cascade="all, delete-orphan", order_by="AgentEvent.seq_no")


class AgentEvent(Base):
    """Agent 运行中的单个事件（append-only 事件溯源）

    event_type 枚举：
    - text: 文本 chunk
    - tool_calls: 工具调用开始
    - tool_result: 工具调用结束
    - token_stats: token 统计
    - error: 错误
    - done: 完成
    """
    __tablename__ = "agent_events"

    id = Column(String(64), primary_key=True, default=lambda: f"evt_{uuid.uuid4().hex[:16]}")
    run_id = Column(String(64), ForeignKey("agent_runs.id"), index=True)

    # 序号：在同一个 run 内递增，保证事件顺序
    seq_no = Column(Integer, nullable=False, default=0)

    # 事件类型 + 数据
    event_type = Column(String(30), nullable=False)  # text / tool_calls / tool_result / error / done
    event_data = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("AgentRun", back_populates="events")
