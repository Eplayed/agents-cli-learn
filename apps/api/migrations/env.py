"""Alembic 迁移环境（异步 SQLAlchemy）

要点：
- url 从 app.core.config.settings.DATABASE_URL 读，迁移和运行时同一个库
- 同时支持 SQLite（dev）与 Postgres（生产），因为模型用的是 SQLAlchemy 通用类型
- online 用异步引擎 + run_sync 执行迁移；offline（--sql）直接按方言渲染 DDL
- compare_type=True 让 autogenerate 能识别列类型变化
"""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.core.config import settings
from app.core.database import Base
import app.models.models  # noqa: F401  导入以把所有表注册到 Base.metadata

config = context.config

# 用应用配置的 DATABASE_URL 覆盖 ini 里的占位（% 转义防 ConfigParser 插值报错）
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线模式：不连库，直接把迁移渲染成 SQL（alembic ... --sql）。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        render_as_batch=connection.dialect.name == "sqlite",  # SQLite 用 batch 模式支持 ALTER
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """在线模式：异步引擎连库，run_sync 里跑同步迁移逻辑。"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
