"""
Database Connection - SQLAlchemy Async
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

# 创建异步数据库引擎（AsyncEngine）
# - SQLite: sqlite+aiosqlite
# - Postgres: postgresql+asyncpg
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
)

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
    # 生产环境通常用 Alembic 迁移来管理 schema
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    # FastAPI 依赖注入：为每个请求提供一个 AsyncSession
    # 使用 yield 形式，确保请求结束后 Session 会被正确关闭
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
