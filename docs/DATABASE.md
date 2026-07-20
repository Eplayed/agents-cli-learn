# 数据库与迁移（SQLite dev / Postgres 生产）

本项目业务库同时支持 **SQLite（开发默认，零配置）** 和 **PostgreSQL（生产，可水平扩展）**，
schema 变更用 **Alembic** 管理。模型全部用 SQLAlchemy 通用类型，所以同一套迁移两边都能跑。

## 两种模式怎么切

| | 开发（默认） | 生产 |
|---|---|---|
| 业务库 | SQLite 文件 `noah_agent.db` | PostgreSQL |
| 建表方式 | 启动时 `init_db()` 自动 `create_all`（零配置） | **Alembic 迁移**（`alembic upgrade head`），启动不自动建表 |
| 对话状态 Checkpointer | 本地 `checkpoints.db`（单机） | AsyncPostgresSaver（多机共享） |
| 水平扩展 | ❌ 单机 | ✅ 多副本共享同一 Postgres |

切换只需改 `DATABASE_URL`（`.env.dev` / 环境变量）：

```bash
# 开发（默认）
DATABASE_URL=sqlite+aiosqlite:///./noah_agent.db

# 生产
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/noah_agent
```

## 生产上线流程（Postgres）

```bash
# 1) 装可选依赖（业务库 asyncpg 已含；对话状态多机共享需 psycopg + pg checkpointer）
pip install "psycopg[binary]" langgraph-checkpoint-postgres

# 2) 设置 DATABASE_URL 指向 Postgres（见上）

# 3) 应用迁移建表（生产不再靠 create_all）
cd apps/api && alembic upgrade head

# 4) 启动应用
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

启动时若检测到非 SQLite，`init_db()` 不会自动建表，只校验连通性并提示用 Alembic。
Checkpointer 会自动选 AsyncPostgresSaver（未装 pg checkpointer 时优雅降级到本地 SQLite 并告警）。

## 常用 Alembic 命令（在 `apps/api/` 下执行）

```bash
alembic upgrade head            # 升级到最新
alembic downgrade -1            # 回滚一步
alembic current                 # 当前版本
alembic history                 # 迁移历史

# 改了模型后，自动生成新迁移（务必人工 review 生成的文件！）
alembic revision --autogenerate -m "add xxx column"

# 离线看将执行的 SQL（不连库），可用来核对 Postgres DDL
DATABASE_URL=postgresql+asyncpg://u:p@localhost/db alembic upgrade head --sql
```

## 说明与注意

- **dev 用 create_all，别在同一个 SQLite 文件上再跑 Alembic**：create_all 建的表没有 `alembic_version` 记录，Alembic 会以为没迁移过而重复建表报错。dev 想体验迁移就用一个全新的库文件。
- 生产**只用 Alembic**：`init_db()` 对 Postgres 主动跳过建表，避免和版本管理打架。
- 模型改动后一定 `--autogenerate` 生成迁移并 **人工 review**（autogenerate 不是万能的，改列类型/重命名等需手工确认）。
- 迁移文件位置：`apps/api/migrations/versions/`，环境配置在 `apps/api/migrations/env.py`（异步引擎，url 取自 `settings.DATABASE_URL`）。

相关文件：`app/core/database.py`（init_db 分方言）、`app/core/checkpointer.py`（Checkpointer 分方言）、`alembic.ini`、`migrations/`。
