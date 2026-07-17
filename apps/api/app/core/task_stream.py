"""
任务化流式 + 事件重放（M12「改法 B」：流式断线续传）

参考 crm-ai-h5 的「POST 建任务 + GET 观察流」两步式设计：
把「提交消息」和「接收流」解耦，让 Agent 在后台任务里独立运行，
事件写入一个带单调 event_id 的缓冲区。客户端可以随时断开、
再用 Last-Event-ID / ?after_id= 重连，从上次收到的事件之后接着收。

为什么需要内存缓冲区（而不是只靠 DB）？
- 断线续传的主场景是「网络抖动 / 刷新页面」，此时服务端进程还活着，
  Agent 还在跑。内存缓冲区能全保真回放（含 text token），且零 DB 压力。
- 跨进程重启的持久化由既有 RunTracker/AgentEvent 兜底（只存非 text 事件，
  见 chat.py 的 GET /tasks/{id}/stream 的 DB 回放分支）。

并发模型：单进程 asyncio。用 asyncio.Condition 做「有新事件」的通知，
follow() 是一个异步生成器，多个观察者可各自独立地 follow 同一个任务。
"""
import asyncio
import time
from typing import AsyncIterator, Optional


class StreamTask:
    """一个后台运行的流式任务 + 其事件缓冲区。"""

    def __init__(self, task_id: str, session_id: str):
        self.task_id = task_id
        self.session_id = session_id
        # 事件缓冲：[{"id": int, "chunk": {...}}]，id 从 1 单调递增
        self.events: list[dict] = []
        self.done = False
        self.error: Optional[str] = None
        self.created_at = time.time()
        self.finished_at: Optional[float] = None
        self._seq = 0
        self._cond = asyncio.Condition()

    async def emit(self, chunk: dict) -> int:
        """追加一个事件，返回其 event_id。会唤醒所有 follow() 观察者。"""
        async with self._cond:
            self._seq += 1
            self.events.append({"id": self._seq, "chunk": chunk})
            self._cond.notify_all()
            return self._seq

    async def finish(self, error: Optional[str] = None) -> None:
        """标记任务结束（正常或异常），唤醒观察者收尾。"""
        async with self._cond:
            self.done = True
            self.error = error
            self.finished_at = time.time()
            self._cond.notify_all()

    async def follow(self, after_id: int = 0) -> AsyncIterator[dict]:
        """从 after_id 之后开始产出事件，直到任务完成且事件全部发完。

        - after_id=0：从头收（新连接）
        - after_id=N：断线重连，跳过已收到的前 N 个事件（事件重放）
        产出的元素形如 {"id": int, "chunk": {...}}。
        """
        last = after_id
        while True:
            async with self._cond:
                # 等到「任务结束」或「出现 id > last 的新事件」为止
                await self._cond.wait_for(
                    lambda: self.done or (bool(self.events) and self.events[-1]["id"] > last)
                )
                pending = [e for e in self.events if e["id"] > last]
                is_done = self.done

            for e in pending:
                last = e["id"]
                yield e

            if is_done:
                # 收尾：把结束瞬间可能追加的最后几个事件也发完
                async with self._cond:
                    tail = [e for e in self.events if e["id"] > last]
                for e in tail:
                    last = e["id"]
                    yield e
                return


class TaskRegistry:
    """进程内任务表。带 TTL 回收 + 数量上限，防止内存无限增长。"""

    def __init__(self, ttl_seconds: float = 300.0, max_tasks: int = 200):
        self._tasks: dict[str, StreamTask] = {}
        self._ttl = ttl_seconds
        self._max = max_tasks

    def create(self, task_id: str, session_id: str) -> StreamTask:
        self._gc()
        task = StreamTask(task_id, session_id)
        self._tasks[task_id] = task
        return task

    def get(self, task_id: str) -> Optional[StreamTask]:
        return self._tasks.get(task_id)

    def _gc(self) -> None:
        now = time.time()
        # 1) 清掉「已完成且超过 TTL」的任务
        stale = [
            tid for tid, t in self._tasks.items()
            if t.finished_at is not None and (now - t.finished_at) > self._ttl
        ]
        for tid in stale:
            self._tasks.pop(tid, None)
        # 2) 超过硬上限时，优先丢弃最早完成的任务
        if len(self._tasks) > self._max:
            finished = sorted(
                ((t.finished_at or now, tid) for tid, t in self._tasks.items() if t.done),
                key=lambda x: x[0],
            )
            overflow = len(self._tasks) - self._max
            for _, tid in finished[:overflow]:
                self._tasks.pop(tid, None)


# 全局单例（进程内共享）
registry = TaskRegistry()
