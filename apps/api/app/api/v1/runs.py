"""
Runs API - Agent 运行历史查询（可观测性）

提供对 agent_runs / agent_events 的查询接口：
- GET /api/v1/runs         — 列出历史运行（分页，可按 session/user 筛选）
- GET /api/v1/runs/{id}    — 查询单次运行详情 + 完整事件流
- GET /api/v1/runs/quota   — 查询当前用户配额使用情况
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.core.quota import get_usage_info
from app.models.models import AgentRun, AgentEvent

router = APIRouter()


@router.get("/")
async def list_runs(
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """列出历史 Agent 运行记录（最新在前）

    可选筛选：session_id, user_id, status
    """
    stmt = select(AgentRun).order_by(desc(AgentRun.queued_at))

    if session_id:
        stmt = stmt.where(AgentRun.session_id == session_id)
    if user_id:
        stmt = stmt.where(AgentRun.user_id == user_id)
    if status:
        stmt = stmt.where(AgentRun.status == status)

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    runs = result.scalars().all()

    return {
        "runs": [
            {
                "id": r.id,
                "session_id": r.session_id,
                "user_id": r.user_id,
                "agent_key": r.agent_key,
                "model": r.model,
                "prompt": r.prompt[:200] if r.prompt else None,  # 截断避免过长
                "status": r.status,
                "error_message": r.error_message,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
                "total_tokens": r.total_tokens,
                "cost_usd": r.cost_usd,
                "queued_at": r.queued_at,
                "started_at": r.started_at,
                "finished_at": r.finished_at,
            }
            for r in runs
        ],
        "offset": offset,
        "limit": limit,
    }


@router.get("/quota")
async def get_quota():
    """查询当前用户的配额使用情况"""
    user = get_current_user_optional()
    uid = user.user_id if user else None
    return get_usage_info(uid)


@router.get("/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """查询单次运行详情 + 完整事件流（事件溯源回放）"""
    stmt = select(AgentRun).where(AgentRun.id == run_id)
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # 加载事件（按 seq_no 排序）
    evt_stmt = (
        select(AgentEvent)
        .where(AgentEvent.run_id == run_id)
        .order_by(AgentEvent.seq_no)
    )
    evt_result = await db.execute(evt_stmt)
    events = evt_result.scalars().all()

    return {
        "run": {
            "id": run.id,
            "session_id": run.session_id,
            "user_id": run.user_id,
            "idempotency_key": run.idempotency_key,
            "agent_key": run.agent_key,
            "model": run.model,
            "prompt": run.prompt,
            "status": run.status,
            "error_message": run.error_message,
            "input_tokens": run.input_tokens,
            "output_tokens": run.output_tokens,
            "total_tokens": run.total_tokens,
            "cost_usd": run.cost_usd,
            "queued_at": run.queued_at,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
        },
        "events": [
            {
                "id": e.id,
                "seq_no": e.seq_no,
                "event_type": e.event_type,
                "event_data": e.event_data,
                "created_at": e.created_at,
            }
            for e in events
        ],
        "event_count": len(events),
    }
