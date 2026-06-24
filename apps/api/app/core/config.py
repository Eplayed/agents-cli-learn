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

    # 可用模型列表（前端下拉选择用）
    # 用户可在 .env.dev 中覆盖，逗号分隔
    AVAILABLE_MODELS: str = "gpt-4o-mini,gpt-4o,gpt-4.1-mini,gpt-4.1,gpt-3.5-turbo"

    # =========================
    # Web 配置
    # =========================
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8080"]

    # =========================
    # 仅用于演示的服务端密钥（生产环境必须替换/下发）
    # =========================
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    # =========================
    # 鉴权配置（M5）
    # =========================
    # AUTH_SECRET 为空 → 不鉴权（开发友好）
    # AUTH_SECRET 有值 → 请求必须带 Authorization: Bearer <AUTH_SECRET>
    AUTH_SECRET: str = ""

    # =========================
    # 配额控制（M10+）
    # =========================
    # 每用户每天 token 上限（所有模型合计）
    # 超限返回 429。设为 0 = 禁止所有请求。
    QUOTA_DAILY_TOKENS: int = 500_000

    # 白名单 user_id（逗号分隔），不受配额限制
    # 设为 * = 所有用户不限（开发模式）
    QUOTA_WHITELIST: str = "*"

    # =========================
    # RAG 配置（M9）
    # =========================
    # False = 不加载 embedding 模型（首次启动快，默认关闭）
    # True = 启用 RAG 知识库检索（首次会下载 ~90MB 模型）
    ENABLE_RAG: bool = False

    # =========================
    # 可观测配置（M6 - Langfuse）
    # =========================
    # 配置后自动追踪所有 LLM 调用 + 工具执行
    # 不配置 = 不追踪（不影响功能）
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

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
