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
    """创建并初始化 Checkpointer，按 DATABASE_URL 选择后端。

    - Postgres（生产，多机共享）：AsyncPostgresSaver —— 这是"真正水平扩展"的关键，
      多个副本共享同一份对话图状态。需 `pip install "psycopg[binary]" langgraph-checkpoint-postgres`。
      未安装时优雅降级到本地 SQLite（并打印警告：无法多机共享）。
    - 其它（SQLite dev）：AsyncSqliteSaver —— 本地文件，单机够用。

    用法（在 FastAPI lifespan 中）：
        async with create_checkpointer() as saver:
            app.state.checkpointer = saver
            yield
    """
    url = settings.DATABASE_URL
    if url.startswith("postgresql"):
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            # AsyncPostgresSaver 用 psycopg(3) DSN，去掉 +asyncpg 驱动后缀
            conn_str = url.replace("postgresql+asyncpg", "postgresql")
            async with AsyncPostgresSaver.from_conn_string(conn_str) as saver:
                await saver.setup()  # 自动建 checkpoint 相关表
                print("[Checkpointer] 使用 AsyncPostgresSaver（多机共享，支持水平扩展）")
                yield saver
                return
        except ImportError:
            print(
                "[Checkpointer] 未安装 langgraph-checkpoint-postgres，回退到本地 SQLite "
                "（单机，无法多副本共享对话状态）。生产请 "
                "`pip install \"psycopg[binary]\" langgraph-checkpoint-postgres`"
            )

    # 默认/回退：SQLite 本地文件
    async with AsyncSqliteSaver.from_conn_string(CHECKPOINT_DB_PATH) as saver:
        await saver.setup()
        yield saver
