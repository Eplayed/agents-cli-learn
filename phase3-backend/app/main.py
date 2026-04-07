"""
Noah Agent Platform - FastAPI Backend
Phase 3: Enterprise Python Backend with Multi-Agent
"""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from app.core.config import settings
from app.core.database import init_db
from app.api.v1 import chat, team, session


@asynccontextmanager
async def lifespan(app: FastAPI):
    # FastAPI 生命周期钩子：
    # - 启动：初始化数据库（建表）
    # - 关闭：打印日志
    print("Starting Noah Agent Platform...")
    await init_db()
    print("Database initialized")
    yield
    print("Shutting down...")


# FastAPI 应用实例
app = FastAPI(title="Noah Agent Platform", description="Enterprise AI Agent Backend", version="1.0.0", lifespan=lifespan)

# 允许 Web UI/前端跨域调用（学习项目直接全放开 methods/headers）
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# 路由挂载：Phase 3 的 HTTP API 入口都从这里开始
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Single Agent"])
app.include_router(team.router, prefix="/api/v1/team", tags=["Multi-Agent"])
app.include_router(session.router, prefix="/api/v1/session", tags=["Session"])


@app.get("/")
async def root():
    return {"service": "Noah Agent Platform", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/ui", include_in_schema=False)
async def ui():
    # Web UI 静态页入口（不需要前端工程/打包）
    # 浏览器打开 /ui 后，通过 fetch 调用上面的 /api/v1/* 接口
    ui_file = Path(__file__).resolve().parent / "ui" / "index.html"
    return FileResponse(ui_file)
