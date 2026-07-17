"""
任务化流式端点测试（M12 改法 B）

不依赖真实 LLM：测试环境没有 API Key 时，创建任务后后台只发
config_error + done，SSE 契约与正常路径一致，可用于稳定断言。
"""
import json

import pytest


@pytest.fixture(autouse=True)
def _force_missing_key(monkeypatch):
    """强制走 config_error 路径：后台任务只发 config_error + done，
    不触发真实 LLM 调用，让 SSE 断言稳定、不依赖是否配了 API Key。"""
    monkeypatch.setattr("app.api.v1.chat._is_api_key_missing", lambda: True)


def _parse_sse(text: str):
    """把 SSE 原始文本解析成事件列表 [{id, event, data(dict)}]"""
    events = []
    # sse-starlette 默认用 CRLF 分隔，先归一化再按空行切分事件
    text = text.replace("\r\n", "\n")
    for block in text.split("\n\n"):
        block = block.strip("\r\n")
        if not block:
            continue
        ev = {"id": None, "event": "message", "data": None}
        data_lines = []
        for line in block.split("\n"):
            line = line.rstrip("\r")
            if not line or line.startswith(":"):
                continue
            field, _, value = line.partition(":")
            value = value.lstrip(" ")
            if field == "id":
                ev["id"] = value
            elif field == "event":
                ev["event"] = value
            elif field == "data":
                data_lines.append(value)
        if data_lines:
            try:
                ev["data"] = json.loads("\n".join(data_lines))
            except json.JSONDecodeError:
                ev["data"] = "\n".join(data_lines)
        events.append(ev)
    return events


@pytest.mark.asyncio
async def test_create_task_returns_task_id(client):
    """POST /chat/tasks 应返回 task_id 与 session_id"""
    resp = await client.post("/api/v1/chat/tasks", json={"message": "你好", "stream": True})
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("task_id")
    assert body.get("session_id")


@pytest.mark.asyncio
async def test_stream_task_emits_done(client):
    """创建任务后 GET stream 应能收到事件流，并以 done 结束"""
    created = (await client.post("/api/v1/chat/tasks", json={"message": "hi", "stream": True})).json()
    task_id = created["task_id"]

    resp = await client.get(f"/api/v1/chat/tasks/{task_id}/stream")
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    # 首帧是 open（新连接），最后应有 done
    assert events[0]["event"] == "open"
    types = [e["data"].get("type") for e in events if isinstance(e["data"], dict)]
    assert "done" in types


@pytest.mark.asyncio
async def test_reconnect_with_after_id_marks_reconnect(client):
    """带 ?after_id= 重连时首帧应是 reconnect 事件，并携带续传起点"""
    created = (await client.post("/api/v1/chat/tasks", json={"message": "hi", "stream": True})).json()
    task_id = created["task_id"]

    resp = await client.get(f"/api/v1/chat/tasks/{task_id}/stream?after_id=1")
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[0]["event"] == "reconnect"
    assert events[0]["data"]["after_id"] == 1


@pytest.mark.asyncio
async def test_unknown_task_returns_error_then_done(client):
    """未知/过期 task_id：应回一条 error 再 done，而不是挂起"""
    resp = await client.get("/api/v1/chat/tasks/task_does_not_exist/stream")
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    types = [e["data"].get("type") for e in events if isinstance(e["data"], dict)]
    assert "error" in types
    assert "done" in types


@pytest.mark.asyncio
async def test_sse_events_carry_incrementing_ids(client):
    """在线任务的 message 事件应带单调递增的 SSE id（供 Last-Event-ID 续传）"""
    created = (await client.post("/api/v1/chat/tasks", json={"message": "hi", "stream": True})).json()
    task_id = created["task_id"]
    resp = await client.get(f"/api/v1/chat/tasks/{task_id}/stream")
    events = _parse_sse(resp.text)
    ids = [int(e["id"]) for e in events if e["id"] and e["id"].isdigit()]
    assert ids, "message 事件应带数字 id"
    assert ids == sorted(ids), "id 应单调递增"
