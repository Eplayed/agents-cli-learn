"""
场景测试 2：会话管理 CRUD
"""
import pytest


@pytest.mark.asyncio
async def test_create_session(client):
    """创建新会话"""
    resp = await client.post("/api/v1/session/", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["id"].startswith("sess_")
    assert data["message_count"] == 0


@pytest.mark.asyncio
async def test_list_sessions(client):
    """列表会话"""
    # 先创建一个
    await client.post("/api/v1/session/", json={})
    resp = await client.get("/api/v1/session/")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_get_session_by_id(client):
    """按 ID 查询会话"""
    create_resp = await client.post("/api/v1/session/", json={})
    sid = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/session/{sid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == sid


@pytest.mark.asyncio
async def test_get_session_not_found(client):
    """查询不存在的会话返回 404"""
    resp = await client.get("/api/v1/session/nonexistent_id")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_session(client):
    """删除会话"""
    create_resp = await client.post("/api/v1/session/", json={})
    sid = create_resp.json()["id"]

    resp = await client.delete(f"/api/v1/session/{sid}")
    assert resp.status_code == 200

    # 确认已删除
    resp2 = await client.get(f"/api/v1/session/{sid}")
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_session_messages_empty(client):
    """新会话的消息列表为空"""
    create_resp = await client.post("/api/v1/session/", json={})
    sid = create_resp.json()["id"]

    resp = await client.get(f"/api/v1/session/{sid}/messages")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_session_summary(client):
    """会话摘要列表"""
    resp = await client.get("/api/v1/session/summary")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
