"""
测试配置 — pytest fixtures

使用方式：
    cd apps/api
    pytest tests/ -v
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest_asyncio.fixture
async def client():
    """异步 HTTP 测试客户端（直接走 ASGI，不启动真实服务器）"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
