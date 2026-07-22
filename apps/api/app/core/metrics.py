"""M17 minimal metrics/APM layer."""
from __future__ import annotations

import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

REQUEST_COUNT: dict[tuple[str, str, int], int] = defaultdict(int)
REQUEST_LATENCY_SUM: dict[tuple[str, str], float] = defaultdict(float)
REQUEST_LATENCY_COUNT: dict[tuple[str, str], int] = defaultdict(int)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not settings.METRICS_ENABLED:
            return await call_next(request)
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            elapsed = time.perf_counter() - start
            route = request.url.path
            method = request.method
            REQUEST_COUNT[(method, route, status)] += 1
            REQUEST_LATENCY_SUM[(method, route)] += elapsed
            REQUEST_LATENCY_COUNT[(method, route)] += 1


def render_prometheus_metrics() -> str:
    lines = [
        "# HELP noah_http_requests_total Total HTTP requests.",
        "# TYPE noah_http_requests_total counter",
    ]
    for (method, route, status), count in sorted(REQUEST_COUNT.items()):
        lines.append(
            f'noah_http_requests_total{{method="{method}",route="{route}",status="{status}"}} {count}'
        )
    lines.extend([
        "# HELP noah_http_request_duration_seconds_sum Total HTTP request latency seconds.",
        "# TYPE noah_http_request_duration_seconds_sum counter",
    ])
    for (method, route), total in sorted(REQUEST_LATENCY_SUM.items()):
        lines.append(f'noah_http_request_duration_seconds_sum{{method="{method}",route="{route}"}} {total:.6f}')
    lines.extend([
        "# HELP noah_http_request_duration_seconds_count Count of measured HTTP request latencies.",
        "# TYPE noah_http_request_duration_seconds_count counter",
    ])
    for (method, route), count in sorted(REQUEST_LATENCY_COUNT.items()):
        lines.append(f'noah_http_request_duration_seconds_count{{method="{method}",route="{route}"}} {count}')
    return "\n".join(lines) + "\n"


def snapshot_metrics() -> dict:
    return {
        "requests_total": [
            {"method": m, "route": r, "status": s, "count": c}
            for (m, r, s), c in sorted(REQUEST_COUNT.items())
        ],
        "latency": [
            {
                "method": m,
                "route": r,
                "count": REQUEST_LATENCY_COUNT[(m, r)],
                "total_seconds": total,
                "avg_seconds": total / max(REQUEST_LATENCY_COUNT[(m, r)], 1),
            }
            for (m, r), total in sorted(REQUEST_LATENCY_SUM.items())
        ],
    }
