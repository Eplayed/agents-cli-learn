"""
Core Configuration
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # =========================
    # 应用基础配置
    # =========================
    APP_NAME: str = "Noah Agent Platform"
    DEBUG: bool = True

    # =========================
    # 数据库配置（默认使用本地 SQLite）
    # =========================
    DATABASE_URL: str = "sqlite+aiosqlite:///./noah_agent.db"

    # =========================
    # 大模型配置（后端 Phase 3 使用）
    # =========================
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # =========================
    # Web 配置
    # =========================
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8080"]

    # =========================
    # 仅用于演示的服务端密钥（生产环境必须替换/下发）
    # =========================
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    class Config:
        # 读取环境变量的优先级：
        # 1) apps/api/.env
        # 2) 项目根目录 .env
        # 3) 项目根目录 .env.dev
        #
        # 这样可以让“前端/后端共用一份 .env.dev”时，后端也能直接读到 OPENAI_API_KEY。
        env_file = (".env", "../../.env", "../../.env.dev")
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    # BaseSettings 会在实例化时读取环境变量与 env_file。
    # 通过 lru_cache 保证全局只创建一次 settings，避免重复 IO 与重复解析。
    return Settings()


settings = get_settings()
