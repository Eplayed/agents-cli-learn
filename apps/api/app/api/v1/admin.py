"""
管理端 API（M15）：配置字段分级查看 + 热更新触发。

安全：生产（配了 AUTH_SECRET）要求 admin 角色；开发（无鉴权）放行。
GET /config 只返回字段名（不含值），不泄漏密钥。
"""
from fastapi import APIRouter, HTTPException

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
