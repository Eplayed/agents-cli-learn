"""
Database Connection - SQLAlchemy Async
"""
import sys

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from app.core.config import settings

# 创建异步数据库引擎（AsyncEngine）
# - SQLite: sqlite+aiosqlite
# - Postgres: postgresql+asyncpg
_engine_kwargs = {"echo": settings.DEBUG}
# 测试环境用 NullPool：pytest-asyncio 每个用例一个独立 event loop，
# 连接池会在多个 loop 间保留连接，跨 loop 被 GC 回收时报
# "non-checked-in connection" 告警。NullPool 用完即关，避免这一问题。
# 仅在检测到 pytest 时启用，不影响生产（生产是单一长驻 loop）。
if "pytest" in sys.modules:
    _engine_kwargs["poolclass"] = NullPool
engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

# AsyncSession 工厂：每次请求从这里创建独立的 Session
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ORM 基类：models.py 里的表都继承自 Base
Base = declarative_base()


async def init_db():
    # 启动时建表（学习/演示友好）
    # 确保所有 model 都被 import，这样 create_all 能创建全部表
    import app.models.models  # noqa: F401
    # 生产环境通常用 Alembic 迁移来管理 schema
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 轻量自动迁移：为已存在的旧表补充新增列（SQLite）
        # create_all 不会 ALTER 已存在的表，这里手动补列，避免删库丢数据
        await conn.run_sync(_ensure_columns)


def _ensure_columns(sync_conn):
    """检查并补充缺失的列（仅 SQLite，幂等）"""
    from sqlalchemy import inspect, text
    inspector = inspect(sync_conn)
    try:
        existing_tables = inspector.get_table_names()
    except Exception:
        return

    # 需要确保存在的列：{表名: {列名: 列定义}}
    required = {
        "messages": {"attachments": "JSON"},
    }
    for table, cols in required.items():
        if table not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        for col_name, col_type in cols.items():
            if col_name not in existing_cols:
                try:
                    sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"))
                except Exception as e:
                    print(f"[DB migrate] add {table}.{col_name} failed: {e}")


async def get_db():
    # FastAPI 依赖注入：为每个请求提供一个 AsyncSession
    # 使用 yield 形式，确保请求结束后 Session 会被正确关闭
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
