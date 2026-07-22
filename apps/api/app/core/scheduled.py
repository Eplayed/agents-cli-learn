"""M18 scheduled task service.

单机学习版：interval/once 触发 AgentRun，写 ScheduledTaskRun 历史。
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from sqlalchemy import and_, desc, select

from app.agents.registry import get_agent, get_default_key
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.run_tracker import RunTracker
from app.models.models import ScheduledTask, ScheduledTaskRun, utcnow


def compute_next_run(now: datetime, interval_seconds: int | None, once_at: datetime | None = None) -> datetime | None:
    if interval_seconds:
        return now + timedelta(seconds=max(interval_seconds, 1))
    return once_at


async def run_scheduled_task(task_id: str, *, trigger: str = "manual", checkpointer=None) -> str:
    """触发一次任务，返回 ScheduledTaskRun id。"""
    async with AsyncSessionLocal() as db:
        task = await db.get(ScheduledTask, task_id)
        if not task:
            raise ValueError(f"Scheduled task not found: {task_id}")

        if task.overlap_policy == "skip":
            running_stmt = select(ScheduledTaskRun).where(
                ScheduledTaskRun.task_id == task_id,
                ScheduledTaskRun.status == "running",
            )
            if (await db.execute(running_stmt)).scalar_one_or_none():
                skipped = ScheduledTaskRun(task_id=task_id, trigger=trigger, status="skipped", scheduled_for=task.next_run_at)
                db.add(skipped)
                await db.commit()
                await db.refresh(skipped)
                return skipped.id

        run_tracker = RunTracker(db)
        run = await run_tracker.start_run(
            session_id=task.session_id or f"scheduled_{task.id}",
            prompt=task.prompt,
            user_id=task.user_id,
            agent_key=task.agent_key,
            model=task.model,
        )
        task_run = ScheduledTaskRun(
            task_id=task.id,
            agent_run_id=run.id,
            trigger=trigger,
            status="running",
            scheduled_for=task.next_run_at,
        )
        db.add(task_run)
        await db.commit()
        await db.refresh(task_run)
        task_run_id = task_run.id

    async def _background():
        status = "completed"
        error = None
        token_stats = {}
        try:
            agent = get_agent(task.agent_key or get_default_key(), session_id=task.session_id or task.id, model=task.model, checkpointer=checkpointer)
            async for chunk in agent.stream(task.prompt):
                if chunk["type"] == "token_stats":
                    token_stats = chunk.get("data", {})
                if chunk["type"] == "done":
                    break
        except Exception as exc:
            status = "failed"
            error = str(exc)

        async with AsyncSessionLocal() as finish_db:
            finish_tracker = RunTracker(finish_db)
            await finish_tracker.finish_run(
                run.id,
                status=status,
                error_message=error,
                input_tokens=token_stats.get("input_tokens", 0),
                output_tokens=token_stats.get("output_tokens", 0),
                total_tokens=token_stats.get("total_tokens", 0),
                cost_usd=token_stats.get("cost_usd", 0.0),
            )
            stored_task = await finish_db.get(ScheduledTask, task_id)
            stored_run = await finish_db.get(ScheduledTaskRun, task_run_id)
            if stored_run:
                stored_run.status = status
                stored_run.error_message = error
                stored_run.finished_at = utcnow()
            if stored_task:
                stored_task.last_run_at = utcnow()
                stored_task.run_count = int(stored_task.run_count or 0) + 1
                if stored_task.max_runs and stored_task.run_count >= stored_task.max_runs:
                    stored_task.enabled = False
                    stored_task.next_run_at = None
                elif stored_task.interval_seconds:
                    stored_task.next_run_at = compute_next_run(utcnow(), stored_task.interval_seconds)
                else:
                    stored_task.enabled = False
                    stored_task.next_run_at = None
            await finish_db.commit()

    asyncio.create_task(_background())
    return task_run_id


class ScheduledTaskService:
    def __init__(self, checkpointer=None):
        self.checkpointer = checkpointer
        self._stopped = asyncio.Event()
        self._active = 0

    async def stop(self) -> None:
        self._stopped.set()

    async def run_loop(self) -> None:
        while not self._stopped.is_set():
            await self.tick_once()
            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=max(settings.SCHEDULER_TICK_SECONDS, 1))
            except asyncio.TimeoutError:
                pass

    async def tick_once(self) -> int:
        if self._active >= settings.SCHEDULER_MAX_CONCURRENT_RUNS:
            return 0
        now = utcnow()
        async with AsyncSessionLocal() as db:
            stmt = (
                select(ScheduledTask)
                .where(
                    and_(
                        ScheduledTask.enabled == True,  # noqa: E712
                        ScheduledTask.next_run_at.is_not(None),
                        ScheduledTask.next_run_at <= now,
                    )
                )
                .order_by(ScheduledTask.next_run_at)
                .limit(settings.SCHEDULER_MAX_CONCURRENT_RUNS - self._active)
            )
            tasks = list((await db.execute(stmt)).scalars().all())

        for task in tasks:
            self._active += 1

            async def _run(tid: str):
                try:
                    await run_scheduled_task(tid, trigger="scheduled", checkpointer=self.checkpointer)
                finally:
                    self._active -= 1

            asyncio.create_task(_run(task.id))
        return len(tasks)


async def list_task_runs(task_id: str, limit: int = 20) -> list[ScheduledTaskRun]:
    async with AsyncSessionLocal() as db:
        stmt = (
            select(ScheduledTaskRun)
            .where(ScheduledTaskRun.task_id == task_id)
            .order_by(desc(ScheduledTaskRun.started_at))
            .limit(max(1, min(limit, 100)))
        )
        return list((await db.execute(stmt)).scalars().all())
