"""M18 定时任务 API。"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_optional
from app.core.database import get_db
from app.core.memory import normalize_user_id
from app.core.scheduled import compute_next_run, list_task_runs, run_scheduled_task
from app.models.models import ScheduledTask, ScheduledTaskRun, utcnow

router = APIRouter()


class ScheduledTaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None
    agent_key: str | None = None
    model: str | None = None
    interval_seconds: int | None = Field(default=None, ge=60)
    once_at: datetime | None = None
    enabled: bool = True
    max_runs: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_schedule(self):
        if not self.interval_seconds and not self.once_at:
            raise ValueError("interval_seconds or once_at is required")
        return self


class ScheduledTaskUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    prompt: str | None = Field(default=None, max_length=4000)
    enabled: bool | None = None
    interval_seconds: int | None = Field(default=None, ge=60)
    next_run_at: datetime | None = None
    max_runs: int | None = Field(default=None, ge=1)


def _current_uid() -> str:
    user = get_current_user_optional()
    return normalize_user_id(user.user_id if user else None)


def _task_dict(task: ScheduledTask) -> dict:
    return {
        "id": task.id,
        "user_id": task.user_id,
        "session_id": task.session_id,
        "name": task.name,
        "prompt": task.prompt,
        "agent_key": task.agent_key,
        "model": task.model,
        "enabled": task.enabled,
        "interval_seconds": task.interval_seconds,
        "next_run_at": task.next_run_at,
        "last_run_at": task.last_run_at,
        "max_runs": task.max_runs,
        "run_count": task.run_count,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def _run_dict(run: ScheduledTaskRun) -> dict:
    return {
        "id": run.id,
        "task_id": run.task_id,
        "agent_run_id": run.agent_run_id,
        "trigger": run.trigger,
        "status": run.status,
        "scheduled_for": run.scheduled_for,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "error_message": run.error_message,
    }


@router.get("/")
async def list_scheduled_tasks(limit: int = 50, db: AsyncSession = Depends(get_db)):
    uid = _current_uid()
    stmt = (
        select(ScheduledTask)
        .where(ScheduledTask.user_id == uid)
        .order_by(desc(ScheduledTask.created_at))
        .limit(max(1, min(limit, 100)))
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return {"tasks": [_task_dict(t) for t in rows], "count": len(rows)}


@router.post("/")
async def create_scheduled_task(body: ScheduledTaskCreate, db: AsyncSession = Depends(get_db)):
    now = utcnow()
    task = ScheduledTask(
        user_id=_current_uid(),
        session_id=body.session_id,
        name=body.name,
        prompt=body.prompt,
        agent_key=body.agent_key,
        model=body.model,
        enabled=body.enabled,
        interval_seconds=body.interval_seconds,
        next_run_at=compute_next_run(now, body.interval_seconds, body.once_at),
        max_runs=body.max_runs,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _task_dict(task)


@router.get("/{task_id}")
async def get_scheduled_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task or task.user_id != _current_uid():
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    return _task_dict(task)


@router.patch("/{task_id}")
async def update_scheduled_task(task_id: str, body: ScheduledTaskUpdate, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task or task.user_id != _current_uid():
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    for field in ("name", "prompt", "enabled", "interval_seconds", "max_runs"):
        value = getattr(body, field)
        if value is not None:
            setattr(task, field, value)
    if body.next_run_at is not None:
        task.next_run_at = body.next_run_at
    elif body.interval_seconds is not None:
        task.next_run_at = compute_next_run(utcnow(), body.interval_seconds)
    task.updated_at = utcnow()
    await db.commit()
    await db.refresh(task)
    return _task_dict(task)


@router.post("/{task_id}/pause")
async def pause_scheduled_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task or task.user_id != _current_uid():
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    task.enabled = False
    await db.commit()
    return {"paused": True}


@router.post("/{task_id}/resume")
async def resume_scheduled_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task or task.user_id != _current_uid():
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    task.enabled = True
    if not task.next_run_at:
        task.next_run_at = compute_next_run(utcnow(), task.interval_seconds)
    await db.commit()
    return {"resumed": True, "next_run_at": task.next_run_at}


@router.post("/{task_id}/trigger")
async def trigger_scheduled_task(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task or task.user_id != _current_uid():
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    run_id = await run_scheduled_task(task_id, trigger="manual", checkpointer=getattr(request.app.state, "checkpointer", None))
    return {"triggered": True, "scheduled_task_run_id": run_id}


@router.delete("/{task_id}")
async def delete_scheduled_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task or task.user_id != _current_uid():
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    await db.execute(delete(ScheduledTaskRun).where(ScheduledTaskRun.task_id == task_id))
    await db.delete(task)
    await db.commit()
    return {"deleted": True}


@router.get("/{task_id}/runs")
async def list_scheduled_runs(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await db.get(ScheduledTask, task_id)
    if not task or task.user_id != _current_uid():
        raise HTTPException(status_code=404, detail="Scheduled task not found")
    rows = await list_task_runs(task_id)
    return {"runs": [_run_dict(r) for r in rows], "count": len(rows)}
