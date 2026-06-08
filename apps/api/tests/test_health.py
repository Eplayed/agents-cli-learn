"""
场景测试 1：基础健康检查 + 元信息端点
"""
import pytest


@pytest.mark.asyncio
async def test_health(client):
    """API 健康检查"""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_root(client):
    """根路径返回服务信息"""
    resp = await client.get("/")
    data = resp.json()
    assert data["service"] == "Noah Agent Platform"
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_models_endpoint(client):
    """模型列表端点"""
    resp = await client.get("/api/v1/models")
    assert resp.status_code == 200
    data = resp.json()
    assert "models" in data
    assert "default" in data
    assert len(data["models"]) > 0


@pytest.mark.asyncio
async def test_agents_endpoint(client):
    """Agent 列表端点"""
    resp = await client.get("/api/v1/agents")
    assert resp.status_code == 200
    data = resp.json()
    assert "agents" in data
    assert "default" in data
    # 至少有 4 个 agent 注册
    assert len(data["agents"]) >= 4
    # 每个 agent 有必须字段
    for agent in data["agents"]:
        assert "key" in agent
        assert "name" in agent
        assert "description" in agent
        assert "milestone" in agent


@pytest.mark.asyncio
async def test_ui_page(client):
    """Web UI 页面可访问"""
    resp = await client.get("/ui")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
