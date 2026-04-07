"""
Chat API - Single Agent endpoints
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.database import get_db
from app.core.config import settings
from app.schemas.chat import ChatRequest, ChatResponse
from app.models.models import Session, Message
from app.agents.single.agent import SingleAgent

router = APIRouter()


async def get_or_create_session(session_id: str | None, db: AsyncSession):
    # session_id 由前端传入：
    # - 有值：尝试复用已有会话（便于“继续上次对话”）
    # - 无值/找不到：创建新会话
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
    # 非流式：等模型完全生成完，返回一次性 JSON（适合简单前端/调试）
    if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.strip() in {"sk-your-key", "sk-xxx"}:
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY 未配置或仍为占位符。请在 phase3-backend/.env 或项目根目录 .env.dev 中设置 OPENAI_API_KEY。",
        )

    session, _ = await get_or_create_session(request.session_id, db)

    # 先把 user 消息落库：这样就算中途模型报错，也能在 DB 里看到“用户问了什么”
    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    agent = SingleAgent(session_id=session.id)
    full_response = ""
    async for chunk in agent.stream(request.message):
        if chunk["type"] == "text":
            full_response += chunk.get("content", "")

    # 再把 assistant 完整回答落库，并更新会话统计
    agent_msg = Message(session_id=session.id, role="assistant", content=full_response)
    db.add(agent_msg)
    session.message_count += 2
    session.updated_at = datetime.utcnow()
    await db.commit()

    return ChatResponse(session_id=session.id, message_id=agent_msg.id, content=full_response, created_at=agent_msg.created_at)


@router.post("/stream")
async def chat_stream(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    # SSE 流式：以 text/event-stream 连续推送事件
    # 注意：某些 Electron/内嵌浏览器环境用 fetch 读 SSE 可能出现 net::ERR_ABORTED
    # 若遇到该问题，建议前端改用 /stream_ndjson（更通用）
    session, _ = await get_or_create_session(request.session_id, db)

    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.strip() in {"sk-your-key", "sk-xxx"}:
        async def event_generator():
            yield {
                "event": "message",
                "data": json.dumps(
                    {
                        "type": "error",
                        "content": "OPENAI_API_KEY 未配置或仍为占位符。请在 phase3-backend/.env 或项目根目录 .env.dev 中设置 OPENAI_API_KEY。",
                    }
                ),
            }
            yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}

        return EventSourceResponse(event_generator())

    agent = SingleAgent(session_id=session.id)

    async def event_generator():
        full_response = ""
        sid = session.id
        try:
            async for chunk in agent.stream(request.message):
                if chunk["type"] == "done":
                    break
                if chunk["type"] == "text":
                    full_response += chunk.get("content", "")
                yield {"event": "message", "data": json.dumps(chunk)}
            
            # 流式结束后再写入 assistant 完整回答：
            # - 流式阶段持续时间可能较长
            # - 使用单独的 inner_db 避免生成器生命周期与请求依赖的 db session 绑定过深
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
            yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}
        except Exception as e:
            yield {"event": "message", "data": json.dumps({"type": "error", "content": str(e)})}
            yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}

    return EventSourceResponse(event_generator())


@router.get("/stream")
async def chat_stream_get(message: str, session_id: str | None = None, db: AsyncSession = Depends(get_db)):
    return await chat_stream(ChatRequest(message=message, session_id=session_id, stream=True), db)


@router.post("/stream_ndjson")
async def chat_stream_ndjson(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    # NDJSON 流式：每一行是一个 JSON（application/x-ndjson）
    # 适配性更强，前端可以用 fetch + ReadableStream 按行解析
    session, _ = await get_or_create_session(request.session_id, db)

    user_msg = Message(session_id=session.id, role="user", content=request.message)
    db.add(user_msg)
    await db.commit()

    async def gen():
        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.strip() in {"sk-your-key", "sk-xxx"}:
            yield (json.dumps({"type": "error", "content": "OPENAI_API_KEY 未配置或仍为占位符。请在 phase3-backend/.env 或项目根目录 .env.dev 中设置 OPENAI_API_KEY。"}) + "\n").encode("utf-8")
            yield (json.dumps({"type": "done", "content": ""}) + "\n").encode("utf-8")
            return

        agent = SingleAgent(session_id=session.id)
        full_response = ""
        sid = session.id

        try:
            async for chunk in agent.stream(request.message):
                if chunk["type"] == "done":
                    break
                if chunk["type"] == "text":
                    full_response += chunk.get("content", "")
                yield (json.dumps(chunk) + "\n").encode("utf-8")

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
            yield (json.dumps({"type": "error", "content": str(e)}) + "\n").encode("utf-8")

        yield (json.dumps({"type": "done", "content": ""}) + "\n").encode("utf-8")

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


from sqlalchemy import select
