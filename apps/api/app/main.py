"""
Noah Agent Platform - FastAPI Backend
Phase 3: Enterprise Python Backend with Multi-Agent
"""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import init_db
from app.core.checkpointer import create_checkpointer
from app.core.auth import AuthMiddleware
from app.core.metrics import MetricsMiddleware
from app.core.trace import TraceMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.api.v1 import admin, ai_testing, auth, chat, files, memory, runs, scheduled, session, skills, team

# 导入 catalog 触发所有 Agent 注册（必须在路由之前）
import app.agents.catalog  # noqa: F401
from app.agents.registry import list_agents, get_default_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    # FastAPI 生命周期钩子：
    # - 启动：初始化数据库 + Checkpointer
    # - 关闭：Checkpointer 连接自动通过 contextmanager 释放
    print("Starting Noah Agent Platform...")

    # M13.6：生产化启动校验。生产环境配置不安全（如 SECRET_KEY 为默认值）直接拒绝启动。
    for _w in settings.validate_runtime():
        print(f"[启动校验][警告] {_w}")

    await init_db()
    print("Database initialized")

    # M5 核心：用 AsyncSqliteSaver 替代 MemorySaver
    # 这样 thread_id 对应的对话状态会持久化到 checkpoints.db
    # 重启 API 后，同一个 session_id 的对话能续上
    async with create_checkpointer() as checkpointer:
        app.state.checkpointer = checkpointer
        print(f"Checkpointer initialized (AsyncSqliteSaver)")
        scheduler_task = None
        scheduler_service = None
        if settings.SCHEDULER_ENABLED:
            from app.core.scheduled import ScheduledTaskService
            import asyncio

            scheduler_service = ScheduledTaskService(checkpointer=checkpointer)
            app.state.scheduler_service = scheduler_service
            scheduler_task = asyncio.create_task(scheduler_service.run_loop())
            print("Scheduled task service started")
        try:
            yield
        finally:
            if scheduler_service is not None:
                await scheduler_service.stop()
            if scheduler_task is not None:
                scheduler_task.cancel()

    print("Shutting down...")


# FastAPI 应用实例
app = FastAPI(title="Noah Agent Platform", description="Enterprise AI Agent Backend", version="1.0.0", lifespan=lifespan)

# 允许 Web UI/前端跨域调用（学习项目直接全放开 methods/headers）
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# M15：请求级限流中间件（在 Auth 之后 add → 比 Auth 内层，能读到鉴权后的 user_id）
app.add_middleware(RateLimitMiddleware)

# M17：基础请求指标
app.add_middleware(MetricsMiddleware)

# M5：Bearer Token 鉴权中间件
# AUTH_SECRET 为空时完全放开（开发模式），设值后必须带 Bearer token
app.add_middleware(AuthMiddleware)

# M12 P1：全链路 Trace-ID 中间件
# 放在最后 add → Starlette 中它是最外层，最先执行，
# 保证 trace_id 在鉴权/业务逻辑之前就已注入，所有日志都能带上。
app.add_middleware(TraceMiddleware)

# 路由挂载：Phase 3 的 HTTP API 入口都从这里开始
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Single Agent"])
app.include_router(team.router, prefix="/api/v1/team", tags=["Multi-Agent"])
app.include_router(session.router, prefix="/api/v1/session", tags=["Session"])
app.include_router(runs.router, prefix="/api/v1/runs", tags=["Runs & Observability"])
app.include_router(skills.router, prefix="/api/v1/skills", tags=["Skill Store"])
app.include_router(ai_testing.router, prefix="/api/v1/ai-testing", tags=["AI Testing"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(memory.router, prefix="/api/v1/memory", tags=["Memory"])
app.include_router(files.router, prefix="/api/v1/files", tags=["Files"])
app.include_router(scheduled.router, prefix="/api/v1/scheduled", tags=["Scheduled Tasks"])

# 挂载 uploads 静态目录（多模态图片附件），URL: /uploads/<session>/<file>
_uploads_dir = Path(__file__).resolve().parent.parent / "uploads"
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")

# Vue 构建产物目录（apps/web/dist，已提交进 git，零构建可用）
_web_dist = Path(__file__).resolve().parent.parent.parent / "web" / "dist"
if (_web_dist / "assets").exists():
    # 挂载构建出的 JS/CSS 资源（vite base=/ui/，所以资源路径是 /ui/assets/*）
    app.mount("/ui/assets", StaticFiles(directory=str(_web_dist / "assets")), name="ui-assets")


@app.get("/")
async def root():
    return {"service": "Noah Agent Platform", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/v1/models")
async def list_models():
    """返回可用模型列表，供前端下拉选择"""
    models = [m.strip() for m in settings.AVAILABLE_MODELS.split(",") if m.strip()]
    return {
        "models": models,
        "default": settings.OPENAI_MODEL,
    }


@app.get("/api/v1/agents")
async def list_agents_endpoint():
    """返回可用 Agent 列表，供前端下拉切换不同能力等级"""
    return {
        "agents": list_agents(),
        "default": get_default_key(),
    }


@app.get("/ui", include_in_schema=False)
@app.get("/ui/{path:path}", include_in_schema=False)
async def ui(path: str = ""):
    # 服务 Vue 构建产物（SPA）。所有 /ui 及子路由（/ui/skills、/ui/logs）
    # 都返回 dist/index.html，由前端 vue-router 接管客户端路由。
    # /ui/assets/* 已由上面的 StaticFiles 挂载处理，不会进到这里。
    index_file = _web_dist / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    # 构建产物不存在时的友好提示（开发者忘了 build）
    return JSONResponse(
        status_code=503,
        content={
            "error": "Web UI 未构建",
            "hint": "运行 `npm run build:web` 生成 apps/web/dist/，或开发时用 `npm run dev:web`（端口 3000）",
        },
    )
