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
    # 运行环境：development / production。生产会触发 validate_runtime() 的严格校验
    ENVIRONMENT: str = "development"

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

    # LLM 单次调用超时（秒）。防止模型不响应时请求永久挂起。
    LLM_TIMEOUT: int = 60

    # 视觉模型：发送图片时使用的多模态模型。
    # 留空 = 用当前 OPENAI_MODEL（要求它本身支持图片输入）。
    # DashScope 示例：qwen-vl-max-latest / qwen-vl-plus
    # OpenAI 示例：gpt-4o / gpt-4o-mini
    VISION_MODEL: str = ""

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
    # AUTH_SECRET 有值 → 请求必须带 Authorization: Bearer <AUTH_SECRET>（遗留共享密钥，向后兼容）
    AUTH_SECRET: str = ""

    # 多用户 JWT 鉴权（M13）
    # 用 SECRET_KEY 做 HS256 签名密钥；token 有效期（分钟）
    JWT_EXPIRE_MINUTES: int = 1440  # 24h

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
    # 高危工具开关（M13.6 安全加固）
    # =========================
    # 默认禁用：删除/转账这类 destructive 工具不加载，Agent 无法自主调用。
    # 需要演示 HITL 时显式设为 True。
    ALLOW_DANGEROUS_TOOLS: bool = False

    # =========================
    # M14 安全能力
    # =========================
    # 内容安全：送 LLM / 落库前做 PII 脱敏 + 敏感词拦截
    CONTENT_SAFETY_ENABLED: bool = True
    # 额外敏感词（逗号分隔），会并入内置词表
    SENSITIVE_WORDS: str = ""

    # HITL 人审闭环：需审批工具执行前用 interrupt() 暂停，等人工批准
    HITL_ENABLED: bool = True
    # 需要人工审批的工具名（逗号分隔）
    HITL_APPROVAL_TOOLS: str = "transfer_money,delete_all_data"
    # 未审批的等待超时（秒），超时按拒绝处理，避免永久卡死
    HITL_APPROVAL_TIMEOUT: int = 300

    # =========================
    # 请求级限流（M15）
    # =========================
    # 默认关闭（dev 宽松），生产建议开启（validate_runtime 会提示）
    RATE_LIMIT_ENABLED: bool = False
    # 每个 key（user_id / IP）在 window 秒内最多 max 个请求
    RATE_LIMIT_MAX_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60

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

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in ("production", "prod")

    def validate_runtime(self) -> list[str]:
        """生产化启动校验（M13.6）。

        - 严重项（生产必须修）→ 抛 RuntimeError 拒绝启动
        - 警告项 → 返回列表由 main.py 打印，不阻断启动
        开发环境只返回空列表（不打扰）。
        """
        if not self.is_production:
            return []

        critical: list[str] = []
        warnings: list[str] = []

        # 严重：SECRET_KEY 是 JWT 签名密钥，默认值意味着任何人都能伪造 token
        if self.SECRET_KEY == "dev-secret-key-change-in-production" or not self.SECRET_KEY:
            critical.append("SECRET_KEY 仍是默认/空值——JWT 可被伪造，必须换成强随机值")

        # 警告项
        if self.DEBUG:
            warnings.append("DEBUG=True：生产会打印 SQL、泄漏错误细节，建议关闭")
        if not self.AUTH_SECRET:
            warnings.append("AUTH_SECRET 为空：无 token 时按匿名放行，注意是否符合预期")
        if "*" in [w.strip() for w in self.QUOTA_WHITELIST.split(",")]:
            warnings.append("QUOTA_WHITELIST 含 '*'：所有用户不限额")
        if self.ALLOW_DANGEROUS_TOOLS:
            warnings.append("ALLOW_DANGEROUS_TOOLS=True：删除/转账等高危工具已启用")
        if not self.RATE_LIMIT_ENABLED:
            warnings.append("RATE_LIMIT_ENABLED=False：未开请求级限流，生产建议开启")

        if critical:
            raise RuntimeError(
                "生产配置校验失败（ENVIRONMENT=production）：\n  - "
                + "\n  - ".join(critical)
                + "\n请修正后再启动。"
            )
        return warnings

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
