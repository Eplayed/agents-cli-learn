"""
任务化流式内核测试（M12 改法 B）

验证 StreamTask 的事件缓冲 / 重放 / 跟随语义，以及 TaskRegistry 的回收。
纯 asyncio，不依赖 LLM。
"""
import asyncio

import pytest

from app.core.task_stream import StreamTask, TaskRegistry


@pytest.mark.asyncio
async def test_replay_all_from_scratch():
    """已完成任务：follow(0) 应拿到全部事件，id 从 1 递增"""
    task = StreamTask("t1", "sess1")
    await task.emit({"type": "text", "content": "a"})
    await task.emit({"type": "text", "content": "b"})
    await task.emit({"type": "done", "content": ""})
    await task.finish()

    got = [e async for e in task.follow(0)]
    assert [e["id"] for e in got] == [1, 2, 3]
    assert got[0]["chunk"]["content"] == "a"
    assert got[-1]["chunk"]["type"] == "done"


@pytest.mark.asyncio
async def test_resume_after_id_skips_seen_events():
    """断线续传：follow(after_id=1) 应跳过前 1 个，只回放 id>1 的事件"""
    task = StreamTask("t2", "sess1")
    for i in range(3):
        await task.emit({"type": "text", "content": str(i)})
    await task.finish()

    got = [e async for e in task.follow(1)]
    assert [e["id"] for e in got] == [2, 3]


@pytest.mark.asyncio
async def test_live_follow_receives_events_as_they_arrive():
    """在线跟随：先开始 follow，再陆续 emit，最后 finish，应收到全部并正常收尾"""
    task = StreamTask("t3", "sess1")
    received = []

    async def follower():
        async for e in task.follow(0):
            received.append(e["chunk"])

    fut = asyncio.create_task(follower())
    await asyncio.sleep(0.01)
    await task.emit({"type": "text", "content": "hello"})
    await task.emit({"type": "tool_calls", "data": {"name": "get_weather"}})
    await asyncio.sleep(0.01)
    await task.emit({"type": "done", "content": ""})
    await task.finish()

    await asyncio.wait_for(fut, timeout=1.0)
    assert received[0]["content"] == "hello"
    assert received[1]["data"]["name"] == "get_weather"
    assert received[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_follow_returns_immediately_when_done_and_drained():
    """已完成且续传点在末尾之后：follow 不应挂起，立即返回空"""
    task = StreamTask("t4", "sess1")
    await task.emit({"type": "done", "content": ""})
    await task.finish()

    got = await asyncio.wait_for(
        _collect(task.follow(10)), timeout=1.0
    )
    assert got == []


async def _collect(agen):
    return [e async for e in agen]


def test_registry_gc_evicts_finished_over_ttl():
    """TTL 回收：已完成且超期的任务应被清理"""
    import time
    reg = TaskRegistry(ttl_seconds=0.0, max_tasks=100)
    t = reg.create("old", "sess1")
    t.done = True
    t.finished_at = time.time() - 10  # 10s 前完成，已超 ttl=0
    # 触发一次 gc（create 内部会调 _gc）
    reg.create("new", "sess2")
    assert reg.get("old") is None
    assert reg.get("new") is not None
