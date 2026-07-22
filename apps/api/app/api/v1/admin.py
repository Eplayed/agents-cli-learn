"""
管理端 API（M15）：配置字段分级查看 + 热更新触发。

安全：生产（配了 AUTH_SECRET）要求 admin 角色；开发（无鉴权）放行。
GET /config 只返回字段名（不含值），不泄漏密钥。
"""
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.core.config import settings
from app.core.config_reload import classify_fields, reload_hot_config

router = APIRouter()


def _require_admin_or_dev():
    """开发模式（AUTH_SECRET 空）放行；生产要求 admin 角色。"""
    from app.core.auth import get_current_user
    if not settings.AUTH_SECRET:
        return  # 开发模式
    u = get_current_user()
    if getattr(u, "role", "user") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")


@router.get("/config")
async def get_config_classification():
    """查看配置字段分级（热字段 / 重启字段），只给名字不给值。"""
    _require_admin_or_dev()
    return classify_fields()


@router.post("/config/reload")
async def reload_config():
    """重新读取 .env 并原地更新热字段；重启字段变更只提示不应用。"""
    _require_admin_or_dev()
    return reload_hot_config()


@router.get("/metrics")
async def get_metrics(format: str = "prometheus"):
    """M17：导出基础请求指标。

    默认返回 Prometheus 文本；`?format=json` 返回调试友好的 JSON。
    """
    _require_admin_or_dev()
    from app.core.metrics import render_prometheus_metrics, snapshot_metrics

    if format == "json":
        return snapshot_metrics()
    return Response(render_prometheus_metrics(), media_type="text/plain; version=0.0.4")


class RoutePreviewRequest(BaseModel):
    message: str
    agent_key: str | None = None


@router.post("/route-preview")
async def route_preview(body: RoutePreviewRequest):
    """M17：智能路由预览，不真实调用 LLM。"""
    _require_admin_or_dev()
    from app.core.smart_routing import route_agent
    from app.agents.registry import get_default_key

    routed, reason = route_agent(body.message, body.agent_key)
    return {
        "requested_agent": body.agent_key,
        "selected_agent": routed or get_default_key(),
        "reason": reason,
    }
