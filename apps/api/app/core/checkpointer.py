"""
Checkpointer 工厂 — M5 核心改造

为什么从 MemorySaver 换到 AsyncSqliteSaver？
- MemorySaver：只在内存，进程重启全丢，多进程各自独立
- AsyncSqliteSaver：写入 SQLite 文件，重启后恢复，单机部署够用
- 未来换 Postgres：AsyncPostgresSaver，多进程/多机共享

使用方式（在 main.py lifespan 中）：
    async with create_checkpointer() as saver:
        app.state.checkpointer = saver
        yield

为什么用 contextmanager？
- AsyncSqliteSaver 需要 async setup()（建表）
- 需要在 lifespan 结束时正确关闭连接
- contextmanager 是最清晰的资源管理方式
"""
from contextlib import asynccontextmanager
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from app.core.config import settings


# Checkpoint 数据存储路径（和业务 DB 分开，更清晰）
CHECKPOINT_DB_PATH = "./checkpoints.db"


@asynccontextmanager
async def create_checkpointer():
    """创建并初始化 AsyncSqliteSaver。

    用法（在 FastAPI lifespan 中）：
        async with create_checkpointer() as saver:
            app.state.checkpointer = saver
            yield
    """
    async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_DB_PATH) as saver:
        # setup() 会自动建 checkpoint 相关表（如果不存在）
        await saver.setup()
        yield saver
