"""
请求级限流（M15 子目标 A）

进程内**滑动窗口**限流，按 user_id（鉴权后）或客户端 IP 限流，是配额（每日 token）
之外的第二道闸：配额防"烧钱"，限流防"高频打爆"。

设计（与 quota.py 一个路子）：
- 进程内 dict[key -> 时间戳双端队列]，不引 Redis/slowapi 新依赖（学习项目够用）
- 滑动窗口：统计"最近 window 秒内"的请求数，超过 max 就 429 + Retry-After
- 阈值 max/window 每次检查都从 settings 读 → 支持配置热更新（M15-B）
- 默认关闭（RATE_LIMIT_ENABLED=False），与项目"dev 宽松、prod 收紧"的约定一致；
  生产开启，validate_runtime 会在未开时给出警告

注意：进程内计数 = 多副本各算各的（重启清零）。学习项目可接受；
生产多副本要精确全局限流需换 Redis 令牌桶（同 quota 的取舍）。
"""
import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings


class SlidingWindowRateLimiter:
    """滑动窗口限流器：记录每个 key 最近的请求时间戳。"""

    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, max_requests: int, window_seconds: float) -> tuple[bool, float]:
        """返回 (是否放行, 建议 Retry-After 秒)。"""
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            dq = self._hits[key]
            while dq and dq[0] <= cutoff:  # 丢掉窗口外的旧记录
                dq.popleft()
            if len(dq) >= max_requests:
                retry_after = window_seconds - (now - dq[0])
                return False, max(0.0, retry_after)
            dq.append(now)
            return True, 0.0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


# 进程内单例
limiter = SlidingWindowRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """只对 /api/ 请求限流；健康检查/静态资源/UI 放行。"""

    async def dispatch(self, request: Request, call_next):
        if not getattr(settings, "RATE_LIMIT_ENABLED", False):
            return await call_next(request)
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)

        key = self._client_key(request)
        allowed, retry_after = limiter.allow(
            key,
            max_requests=getattr(settings, "RATE_LIMIT_MAX_REQUESTS", 60),
            window_seconds=getattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60),
        )
        if not allowed:
            retry = int(retry_after) + 1
            return JSONResponse(
                status_code=429,
                content={
                    "type": "rate_limited",
                    "content": f"请求过于频繁，请 {retry} 秒后重试。",
                    "retry_after": retry,
                },
                headers={"Retry-After": str(retry)},
            )
        return await call_next(request)

    @staticmethod
    def _client_key(request: Request) -> str:
        # 优先按真实用户（鉴权后），否则按 IP
        try:
            from app.core.auth import get_current_user_optional
            u = get_current_user_optional()
            if u and u.user_id and u.user_id != "anonymous":
                return f"user:{u.user_id}"
        except Exception:
            pass
        client = request.client.host if request.client else "unknown"
        return f"ip:{client}"
