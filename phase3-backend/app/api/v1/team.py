"""
Team API - Multi-Agent endpoints
"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.core.database import get_db
from app.schemas.team import TeamRequest, TeamResponse
from app.models.models import Session
from app.agents.multi.team import MultiAgentTeam

router = APIRouter()


@router.post("/execute")
async def team_execute(request: TeamRequest, db: AsyncSession = Depends(get_db)):
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

    team = MultiAgentTeam(mode=request.mode)
    gen = getattr(team, f"execute_{request.mode}")(request.topic)

    async def event_generator():
        async for chunk in gen:
            yield {"event": "message", "data": json.dumps(chunk)}

    return EventSourceResponse(event_generator())