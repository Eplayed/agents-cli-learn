"""
Team API - Multi-Agent endpoints
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.database import get_db
from app.core.config import settings
from app.schemas.team import TeamRequest, TeamResponse
from app.models.models import Session
from app.agents.multi.team import MultiAgentTeam

router = APIRouter()


@router.post("/execute")
async def team_execute(request: TeamRequest, db: AsyncSession = Depends(get_db)):
    # 非流式：等待整个团队跑完后一次性返回 summary
    if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.strip() in {"sk-your-key", "sk-xxx"}:
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY 未配置或仍为占位符。请在 phase3-backend/.env 或项目根目录 .env.dev 中设置 OPENAI_API_KEY。",
        )

    if request.session_id:
        from sqlalchemy import select
        stmt = select(Session).where(Session.id == request.session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if not session:
            session = Session(id=request.session_id, mode="multi")
            db.add(session)
            await db.commit()
    else:
        session = Session(name=f"Team {datetime.now().strftime('%m/%d %H:%M')}", mode="multi")
        db.add(session)
        await db.commit()

    team = MultiAgentTeam(mode=request.mode)
    gen = getattr(team, f"execute_{request.mode}")(request.topic) if hasattr(team, f"execute_{request.mode}") else None
    
    if not gen:
        raise HTTPException(status_code=400, detail=f"Mode {request.mode} not supported")

    results = []
    summary = ""
    async for chunk in gen:
        if chunk["type"] == "task_result":
            results.append(chunk["content"])
        elif chunk["type"] == "summary":
            summary = chunk["content"]

    return TeamResponse(session_id=session.id, mode=request.mode, summary=summary, created_at=datetime.now())


@router.post("/stream")
async def team_stream(request: TeamRequest, db: AsyncSession = Depends(get_db)):
    # SSE 流式：按 chunk 推送 team 执行过程（agent_start / agent_thinking / task_result / summary）
    # 若前端环境不稳定（net::ERR_ABORTED），可改用 /stream_ndjson
    if request.session_id:
        from sqlalchemy import select
        stmt = select(Session).where(Session.id == request.session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if not session:
            session = Session(id=request.session_id, mode="multi")
            db.add(session)
            await db.commit()
    else:
        session = Session(name=f"Team {datetime.now().strftime('%m/%d %H:%M')}", mode="multi")
        db.add(session)
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

    team = MultiAgentTeam(mode=request.mode)
    gen = getattr(team, f"execute_{request.mode}")(request.topic)

    async def event_generator():
        async for chunk in gen:
            yield {"event": "message", "data": json.dumps(chunk)}
        # Web UI 以 done 作为流式结束标记（便于停止读流/恢复按钮）
        yield {"event": "message", "data": json.dumps({"type": "done", "content": ""})}

    return EventSourceResponse(event_generator())


@router.get("/stream")
async def team_stream_get(topic: str, mode: str = "sequential", session_id: str | None = None, db: AsyncSession = Depends(get_db)):
    return await team_stream(TeamRequest(topic=topic, mode=mode, session_id=session_id), db)


@router.post("/stream_ndjson")
async def team_stream_ndjson(request: TeamRequest, db: AsyncSession = Depends(get_db)):
    # NDJSON 流式：每行一个 JSON，适配性强，便于 fetch + ReadableStream 解析
    if request.session_id:
        from sqlalchemy import select
        stmt = select(Session).where(Session.id == request.session_id)
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        if not session:
            session = Session(id=request.session_id, mode="multi")
            db.add(session)
            await db.commit()
    else:
        session = Session(name=f"Team {datetime.now().strftime('%m/%d %H:%M')}", mode="multi")
        db.add(session)
        await db.commit()

    async def gen():
        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.strip() in {"sk-your-key", "sk-xxx"}:
            yield (json.dumps({"type": "error", "content": "OPENAI_API_KEY 未配置或仍为占位符。请在 phase3-backend/.env 或项目根目录 .env.dev 中设置 OPENAI_API_KEY。"}) + "\n").encode("utf-8")
            yield (json.dumps({"type": "done", "content": ""}) + "\n").encode("utf-8")
            return

        team = MultiAgentTeam(mode=request.mode)
        gen_inner = getattr(team, f"execute_{request.mode}")(request.topic)
        try:
            async for chunk in gen_inner:
                yield (json.dumps(chunk) + "\n").encode("utf-8")
        except Exception as e:
            yield (json.dumps({"type": "error", "content": str(e)}) + "\n").encode("utf-8")

        yield (json.dumps({"type": "done", "content": ""}) + "\n").encode("utf-8")

    return StreamingResponse(
        gen(),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
