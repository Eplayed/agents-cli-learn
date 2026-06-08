"""
Bearer Token 鉴权中间件（M5）

设计原则（参考 ToolHive）：
1. 没设 AUTH_SECRET → 完全放开（开发友好）
2. 设了 AUTH_SECRET → 必须带 Authorization: Bearer <secret>
3. 用 ContextVar 做协程级隔离（并发安全）
4. 验证失败不抛异常（中间件里），由 get_current_user() 统一 401

使用方式：
    # main.py
    from app.core.auth import AuthMiddleware
    app.add_middleware(AuthMiddleware)

    # 在路由/工具中获取当前用户
    from app.core.auth import get_current_user
    user = get_current_user()  # 未认证时抛 401
"""
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings


# ============================================================
# 用户上下文
# ============================================================

@dataclass
class UserContext:
    """当前请求的用户身份信息"""
    user_id: str          # Bearer token 值的哈希前8位（简化版身份标识）
    authenticated: bool   # 是否通过认证


# ContextVar：每个协程独立的"用户上下文"
# 为什么用 ContextVar 而不是全局变量？
# → FastAPI 并发时多个请求在同一进程的不同协程中执行
# → 全局变量会被覆盖，ContextVar 每个协程独立
_current_user: ContextVar[Optional[UserContext]] = ContextVar(
    "current_user", default=None
)


# ============================================================
# 中间件
# ============================================================

class AuthMiddleware(BaseHTTPMiddleware):
    """Bearer Token 鉴权中间件。

    行为：
    - AUTH_SECRET 未设置（空字符串）→ 所有请求放行，标记为匿名用户
    - AUTH_SECRET 已设置 → 检查 Authorization: Bearer <token>
      - token 匹配 → 标记为已认证用户
      - token 不匹配或缺失 → 标记为未认证（但不拦截，由业务层决定是否 401）

    为什么中间件不直接返回 401？
    - 健康检查 /health 不需要鉴权
    - /docs（Swagger）不需要鉴权
    - 具体哪些路由需要鉴权由 get_current_user() 在业务层判断
    """

    async def dispatch(self, request: Request, call_next):
        user_context = self._resolve_user(request)

        # ContextVar.set() 返回一个 token（不是 JWT token，是还原句柄）
        cv_token = _current_user.set(user_context)
        try:
            response = await call_next(request)
            return response
        finally:
            # 请求结束后还原 ContextVar，防止协程复用时泄漏
            _current_user.reset(cv_token)

    def _resolve_user(self, request: Request) -> Optional[UserContext]:
        """从请求中解析用户身份"""
        auth_secret = settings.AUTH_SECRET

        # 没设密钥 → 开发模式，所有人都是匿名已认证
        if not auth_secret:
            return UserContext(user_id="anonymous", authenticated=True)

        # 取 Authorization header
        auth_header = request.headers.get("Authorization", "").strip()
        if not auth_header.lower().startswith("bearer "):
            return None  # 没带 token

        token = auth_header.split(" ", 1)[1].strip()

        # 简单比对（生产环境换 JWT 验签）
        if token == auth_secret:
            # 用 token 哈希前 8 位做 user_id（简化版）
            import hashlib
            uid = hashlib.sha256(token.encode()).hexdigest()[:8]
            return UserContext(user_id=uid, authenticated=True)

        return None  # token 不对


# ============================================================
# 业务层获取当前用户
# ============================================================

def get_current_user() -> UserContext:
    """获取当前请求的用户上下文。

    未认证时抛 HTTP 401（而不是 500）。
    在不需要鉴权的路由中不要调用此函数。
    """
    user = _current_user.get()
    if not user or not user.authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Bearer token. Set AUTH_SECRET in .env.dev and pass Authorization: Bearer <secret>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_user_optional() -> Optional[UserContext]:
    """获取当前用户，未认证时返回 None（不抛异常）。

    适合：可选鉴权的路由（如 /health）。
    """
    user = _current_user.get()
    if user and user.authenticated:
        return user
    return None
