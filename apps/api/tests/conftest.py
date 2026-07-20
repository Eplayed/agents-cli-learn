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
    """异步 HTTP 测试客户端（直接走 ASGI，不启动真实服务器）。

    ASGITransport 不触发 FastAPI lifespan，所以 init_db() 不会自动执行。
    这里显式建表，修复「fresh clone / 新增表未创建」时的 no such table 问题
    （之前测试能过只是因为本地 DB 恰好已有旧表）。
    配合 database.py 在 pytest 下用 NullPool，避免连接跨 event loop 复用。
    """
    from app.core.database import init_db
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
