"""
Session API - Session management
"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy import func

from app.core.database import get_db
from app.schemas.chat import SessionInfo, SessionCreate, SessionSummary
from app.models.models import Session, Message

router = APIRouter()


@router.post("/", response_model=SessionInfo)
async def create_session(request: SessionCreate, db: AsyncSession = Depends(get_db)):
    # 创建一个新会话（单 Agent 默认 mode=single）
    # Web UI 会在打开页面时自动调用这个接口，拿到 session_id 用于后续对话持久化
    session = Session(name=request.name or f"Session {datetime.now().strftime('%m/%d %H:%M')}", mode="single")
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionInfo(id=session.id, name=session.name, message_count=session.message_count, created_at=session.created_at, updated_at=session.updated_at)


@router.get("/", response_model=List[SessionInfo])
async def list_sessions(limit: int = 20, db: AsyncSession = Depends(get_db)):
    # 按最近活跃排序，便于前端展示“最近会话”
    stmt = select(Session).order_by(desc(Session.updated_at)).limit(limit)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return [SessionInfo(id=s.id, name=s.name, message_count=s.message_count, created_at=s.created_at, updated_at=s.updated_at) for s in sessions]


@router.get("/summary", response_model=List[SessionSummary])
async def list_session_summaries(limit: int = 50, db: AsyncSession = Depends(get_db)):
    last_ts = (
        select(Message.session_id, func.max(Message.created_at).label("max_created"))
        .group_by(Message.session_id)
        .subquery()
    )

    stmt = (
        select(Session, Message)
        .outerjoin(last_ts, last_ts.c.session_id == Session.id)
        .outerjoin(
            Message,
            (Message.session_id == Session.id) & (Message.created_at == last_ts.c.max_created),
        )
        .order_by(desc(Session.updated_at))
        .limit(limit)
    )

    result = await db.execute(stmt)
    rows = result.all()

    items: List[SessionSummary] = []
    for sess, msg in rows:
        preview = None
        last_at = None
        last_role = None
        if msg:
            last_role = msg.role
            last_at = msg.created_at
            txt = msg.content or ""
            preview = txt if len(txt) <= 120 else txt[:120] + "…"

        items.append(
            SessionSummary(
                id=sess.id,
                name=sess.name,
                message_count=sess.message_count,
                created_at=sess.created_at,
                updated_at=sess.updated_at,
                last_message_preview=preview,
                last_message_at=last_at,
                last_role=last_role,
            )
        )

    return items


@router.get("/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    # 查询单个会话元信息（不包含消息）
    stmt = select(Session).where(Session.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionInfo(id=session.id, name=session.name, message_count=session.message_count, created_at=session.created_at, updated_at=session.updated_at)


@router.delete("/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    # 删除会话会级联删除 messages（models.py 里 relationship 配置了 cascade）
    stmt = select(Session).where(Session.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"message": "Session deleted"}


@router.get("/{session_id}/messages")
async def get_messages(session_id: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    # 获取会话内消息（按时间正序）
    # 这里直接返回 dict 方便 Web UI 调试；生产环境建议用专门的 schema 严格控制字段
    stmt = select(Message).where(Message.session_id == session_id).order_by(Message.created_at).limit(limit)
    result = await db.execute(stmt)
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "session_id": m.session_id,
            "role": m.role,
            "content": m.content,
            "tool_calls": m.tool_calls,
            "created_at": m.created_at,
        }
        for m in messages
    ]
