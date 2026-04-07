"""
Core Configuration
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Noah Agent Platform"
    DEBUG: bool = True
    DATABASE_URL: str = "sqlite+aiosqlite:///./noah_agent.db"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8080"]
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    class Config:
        env_file = (".env", "../.env", "../.env.dev")
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
