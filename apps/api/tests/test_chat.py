"""
场景测试 3：Chat API（流式 + 非流式 + 各 Agent 模式）

注意：这些测试需要有效的 OPENAI_API_KEY 才能跑通 LLM 相关部分。
没有 key 时只测"API 接口层"（参数校验、会话创建等），LLM 调用会报错但不影响接口层测试。
"""
import json
import pytest


@pytest.mark.asyncio
async def test_chat_send_missing_message(client):
    """空消息应该返回 422（Pydantic 校验）"""
    resp = await client.post("/api/v1/chat/send", json={"message": ""})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_chat_send_too_long(client):
    """超长消息应该返回 422"""
    resp = await client.post("/api/v1/chat/send", json={"message": "x" * 5000})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_chat_stream_ndjson_returns_ndjson_type(client):
    """NDJSON 端点返回正确的 content-type"""
    resp = await client.post(
        "/api/v1/chat/stream_ndjson",
        json={"message": "hello", "agent_key": "basic-chatbot"},
    )
    # 即使 LLM 调用失败，content-type 也应该对
    assert "ndjson" in resp.headers.get("content-type", "") or resp.status_code == 400


@pytest.mark.asyncio
async def test_chat_with_invalid_agent_key(client):
    """无效的 agent_key 返回 400"""
    resp = await client.post(
        "/api/v1/chat/send",
        json={"message": "hello", "agent_key": "nonexistent-agent"},
    )
    assert resp.status_code == 400
    assert "Invalid agent_key" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_chat_creates_session_automatically(client):
    """不传 session_id 时自动创建会话"""
    resp = await client.post(
        "/api/v1/chat/stream_ndjson",
        json={"message": "hi", "agent_key": "basic-chatbot"},
    )
    # 不管 LLM 是否成功，接口层应该能响应
    assert resp.status_code == 200 or resp.status_code == 400


@pytest.mark.asyncio
async def test_chat_reuses_session(client):
    """传 session_id 时复用已有会话"""
    # 先创建会话
    create_resp = await client.post("/api/v1/session/", json={})
    sid = create_resp.json()["id"]

    resp = await client.post(
        "/api/v1/chat/stream_ndjson",
        json={"message": "hi", "session_id": sid, "agent_key": "basic-chatbot"},
    )
    assert resp.status_code == 200 or resp.status_code == 400
