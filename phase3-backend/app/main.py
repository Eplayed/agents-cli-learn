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
    print("Starting Noah Agent Platform...")
    await init_db()
    print("Database initialized")
    yield
    print("Shutting down...")


app = FastAPI(title="Noah Agent Platform", description="Enterprise AI Agent Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

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
    ui_file = Path(__file__).resolve().parent / "ui" / "index.html"
    return FileResponse(ui_file)
