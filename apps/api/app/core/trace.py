"""
全链路 Trace-ID（M12 P1）

参考两个来源：
- crm-ai-h5 的 middleware.ts：在请求入口统一注入 x-request-id / x-trace-id，
  日志和下游调用全程带着走（轻量，不依赖 Langfuse 就能先打通链路）
- bytedance/deer-flow：把同一个 trace_id 塞进 Langfuse trace 的 metadata，
  出错时前端拿这个 ID 直接去 Langfuse 查（见 tracing.py）

设计要点：
1. 用 ContextVar 做协程级隔离（并发安全），和 auth.py 的 user 上下文一致
2. trace_id：跨服务/跨请求关联用。入站带了 X-Trace-Id 就复用（便于串联上游），
   否则新生成。这样前端一次交互里的多个请求可以共享同一个 trace_id
3. request_id：单次 HTTP 请求的唯一 ID。入站带了就复用，否则新生成
4. 响应头统一回传 X-Trace-Id / X-Request-Id，前端/调用方可记录并用于排查
5. 结构化日志：get_logger() 返回自动绑定当前 trace_id/request_id 的 loguru logger
"""
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Optional

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


# ============================================================
# 请求头约定
# ============================================================
TRACE_HEADER = "X-Trace-Id"
REQUEST_HEADER = "X-Request-Id"


# ============================================================
# ContextVar：协程级隔离的 trace 上下文
# ============================================================
_trace_id: ContextVar[str] = ContextVar("trace_id", default="")
_request_id: ContextVar[str] = ContextVar("request_id", default="")


def get_trace_id() -> str:
    """获取当前请求的 trace_id（不在请求上下文时返回空串）"""
    return _trace_id.get()


def get_request_id() -> str:
    """获取当前请求的 request_id（不在请求上下文时返回空串）"""
    return _request_id.get()


def set_trace_context(trace_id: str, request_id: str = "") -> None:
    """在当前协程/任务里显式设置 trace 上下文。

    用途：后台 asyncio 任务（如任务化流式的 Agent 后台运行）脱离了原始请求，
    请求级 ContextVar 已被 reset。在后台任务开头调用它，把创建时捕获的
    trace_id 续上，保证后台产生的日志 / Langfuse trace 仍能与原请求关联。
    """
    _trace_id.set(trace_id)
    if request_id:
        _request_id.set(request_id)


def _gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


# ============================================================
# loguru 结构化日志配置（带 trace_id / request_id 字段）
# ============================================================
# 只配置一次（模块首次 import 时执行）。移除默认 handler，换成带 trace 字段的格式。
logger.remove()
logger.configure(extra={"trace_id": "-", "request_id": "-"})
logger.add(
    sys.stderr,
    level="INFO",
    format=(
        "<green>{time:HH:mm:ss.SSS}</green> | <level>{level: <7}</level> | "
        "trace=<cyan>{extra[trace_id]}</cyan> req=<cyan>{extra[request_id]}</cyan> | "
        "<level>{message}</level>"
    ),
)


def get_logger():
    """返回自动绑定当前 trace_id / request_id 的 logger。

    用法：
        from app.core.trace import get_logger
        get_logger().info("something happened")
    → 输出会带上当前请求的 trace/req，便于日志与 Langfuse trace 关联排查。
    """
    return logger.bind(
        trace_id=get_trace_id() or "-",
        request_id=get_request_id() or "-",
    )


# ============================================================
# 中间件
# ============================================================
class TraceMiddleware(BaseHTTPMiddleware):
    """在请求入口注入 trace_id / request_id，并在响应头回传。

    - 入站 X-Trace-Id 存在 → 复用（跨服务/多请求关联）
    - 入站 X-Request-Id 存在 → 复用，否则新生成
    - 请求开始/结束各记一条结构化日志（带 trace_id）
    """

    # 这些路径不打访问日志，避免刷屏（静态资源/健康检查）
    _QUIET_PREFIXES = ("/ui/assets", "/uploads", "/favicon")

    async def dispatch(self, request: Request, call_next):
        incoming_trace = request.headers.get(TRACE_HEADER, "").strip()
        incoming_req = request.headers.get(REQUEST_HEADER, "").strip()
        trace_id = incoming_trace or _gen_id("trace")
        request_id = incoming_req or _gen_id("req")

        t1 = _trace_id.set(trace_id)
        t2 = _request_id.set(request_id)
        # 也挂到 request.state，方便在路由/流式生成器里显式读取
        request.state.trace_id = trace_id
        request.state.request_id = request_id

        path = request.url.path
        quiet = any(path.startswith(p) for p in self._QUIET_PREFIXES)
        start = time.perf_counter()
        bound = logger.bind(trace_id=trace_id, request_id=request_id)

        try:
            if not quiet:
                bound.info(f"--> {request.method} {path}")
            response = await call_next(request)
            if not quiet:
                dur_ms = (time.perf_counter() - start) * 1000
                bound.info(f"<-- {response.status_code} {request.method} {path} {dur_ms:.1f}ms")
            # 回传响应头（幂等：即使上游已设置也覆盖为本跳的值）
            response.headers[TRACE_HEADER] = trace_id
            response.headers[REQUEST_HEADER] = request_id
            return response
        finally:
            # 请求结束还原 ContextVar，防止协程复用时泄漏（与 auth.py 一致）
            _trace_id.reset(t1)
            _request_id.reset(t2)
