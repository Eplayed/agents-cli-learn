"""
Agent Run Tracker（M10+ 运行持久化服务）

把 Agent 的每次运行（run）和事件（event）持久化到 DB，实现：
- 可审计：任何一次调用的完整事件链条都可查
- 可回放：前端可重播某次 run 的事件流
- 可计费：基于 run 统计 token 消耗
- 幂等性：通过 idempotency_key 去重

用法：
    tracker = RunTracker(db)
    run = await tracker.start_run(session_id="...", prompt="...", ...)
    await tracker.record_event(run.id, "text", {"content": "hello"})
    await tracker.record_event(run.id, "tool_calls", {"name": "get_weather", ...})
    await tracker.finish_run(run.id, status="completed", input_tokens=100, ...)
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AgentRun, AgentEvent


class RunTracker:
    """Agent 运行生命周期追踪器"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._seq_counters: dict[str, int] = {}  # run_id -> 当前 seq_no

    async def start_run(
        self,
        session_id: str,
        prompt: str,
        user_id: Optional[str] = None,
        agent_key: Optional[str] = None,
        model: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> AgentRun:
        """创建并持久化一个新的 AgentRun（状态 = running）"""
        now = datetime.utcnow()
        run = AgentRun(
            session_id=session_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            agent_key=agent_key,
            model=model,
            prompt=prompt,
            status="running",
            queued_at=now,
            started_at=now,
        )
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        self._seq_counters[run.id] = 0
        return run

    async def record_event(
        self,
        run_id: str,
        event_type: str,
        event_data: Optional[dict] = None,
    ) -> AgentEvent:
        """追加一个事件到 run 的事件流（append-only）"""
        seq = self._seq_counters.get(run_id, 0) + 1
        self._seq_counters[run_id] = seq

        event = AgentEvent(
            run_id=run_id,
            seq_no=seq,
            event_type=event_type,
            event_data=event_data,
        )
        self.db.add(event)
        # 立即 commit，不持有长事务（避免 SQLite 锁冲突）
        await self.db.commit()
        return event

    async def finish_run(
        self,
        run_id: str,
        status: str = "completed",
        error_message: Optional[str] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        total_tokens: int = 0,
        cost_usd: float = 0.0,
    ) -> None:
        """结束运行：更新状态 + token 统计 + 提交所有未提交事件"""
        stmt = select(AgentRun).where(AgentRun.id == run_id)
        result = await self.db.execute(stmt)
        run = result.scalar_one_or_none()
        if not run:
            return

        run.status = status
        run.error_message = error_message
        run.input_tokens = input_tokens
        run.output_tokens = output_tokens
        run.total_tokens = total_tokens
        run.cost_usd = cost_usd
        run.finished_at = datetime.utcnow()
        await self.db.commit()

        # 清理 seq 计数器
        self._seq_counters.pop(run_id, None)

    async def get_by_idempotency_key(self, key: str) -> Optional[AgentRun]:
        """通过幂等键查找已有 run（用于去重）"""
        stmt = select(AgentRun).where(AgentRun.idempotency_key == key)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
