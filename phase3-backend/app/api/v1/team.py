"""
Team API - Multi-Agent endpoints
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
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

    return EventSourceResponse(event_generator())
