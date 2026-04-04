"""
Chat API - Single Agent endpoints
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.database import get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.models.models import Session, Message
from app.agents.single.agent import SingleAgent

router = APIRouter()


async def get_or_create_session(session_id: str | None, db: AsyncSession):
    if session_id:
        from sqlalchemy import select
        stmt = select(Session).where(Session.id == session_id)
        result = await db.execute(stmt)
        sess = result.scalar_one_or_none()
        if sess:
            return sess, False

    new_session = Session(name=f"Session {datetime.now().strftime('%m/%d %H:%M')}", mode="single")
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session, True


@router.post("/send")
async def chat_send(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    session, _ = await get_or_create_session(request.session_id, db)

    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    agent = SingleAgent(session_id=session.id)
    full_response = ""
    async for chunk in agent.stream(request.message):
        if chunk["type"] == "text":
            full_response += chunk.get("content", "")

    agent_msg = Message(session_id=session.id, role="assistant", content=full_response)
    db.add(agent_msg)
    session.message_count += 2
    session.updated_at = datetime.utcnow()
    await db.commit()

    return ChatResponse(session_id=session.id, message_id=agent_msg.id, content=full_response, created_at=agent_msg.created_at)


@router.post("/stream")
async def chat_stream(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    session, _ = await get_or_create_session(request.session_id, db)

    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    agent = SingleAgent(session_id=session.id)

    async def event_generator():
        full_response = ""
        sid = session.id
        try:
            async for chunk in agent.stream(request.message):
                if chunk["type"] == "text":
                    full_response += chunk.get("content", "")
                yield {"event": "message", "data": json.dumps(chunk)}
            
            # Save after stream
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as inner_db:
                agent_msg = Message(session_id=sid, role="assistant", content=full_response)
                inner_db.add(agent_msg)
                stmt = select(Session).where(Session.id == sid)
                result = await inner_db.execute(stmt)
                sess = result.scalar_one()
                sess.message_count += 2
                sess.updated_at = datetime.utcnow()
                await inner_db.commit()
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"type": "error", "content": str(e)})}

    return EventSourceResponse(event_generator())


from sqlalchemy import select