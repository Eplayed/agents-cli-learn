"""
配置热更新 + 字段分级（M15 子目标 B）

参照 DeerFlow 的 reload_boundary：把配置分两类——
- **热字段**：改了下次请求就生效（模型/温度类、配额、限流、HITL、内容安全、可用模型 等）
- **重启字段**：基础设施类，改了必须重启（DATABASE_URL / ENVIRONMENT / SECRET_KEY / CORS）

原理：`settings` 是模块级单例，各处都用 `settings.X` 在**调用时**读取。
热更新 = 重新读一遍 .env → 只把热字段 setattr 回单例上 → 所有读取方下次自然拿到新值。
重启字段即使在磁盘上改了也不原地生效，只在报告里提示"需重启"，避免基础设施被半路换掉。
"""
from app.core.config import Settings, settings


# 基础设施类：改了必须重启，热更新时不原地应用
RESTART_ONLY_FIELDS = {
    "DATABASE_URL",   # 换库要重建引擎/连接池
    "ENVIRONMENT",    # 影响启动校验语义
    "SECRET_KEY",     # JWT 签名密钥，半路换会让已签发 token 全失效
    "CORS_ORIGINS",   # 中间件启动时已装配
}

# 名字含这些词的字段视为密钥，报告里不回显具体值
_SECRET_HINTS = ("KEY", "SECRET", "TOKEN", "PASSWORD")


def _is_secret(name: str) -> bool:
    upper = name.upper()
    return any(h in upper for h in _SECRET_HINTS)


def classify_fields() -> dict:
    """返回字段分级（只给名字，不含值——安全）。"""
    all_fields = list(Settings.model_fields.keys())
    hot = [f for f in all_fields if f not in RESTART_ONLY_FIELDS]
    return {
        "hot_fields": sorted(hot),
        "restart_only_fields": sorted(RESTART_ONLY_FIELDS),
    }


def reload_hot_config() -> dict:
    """重新读取 .env / 环境变量，原地更新热字段；重启字段变更只提示不应用。

    返回报告：{reloaded: [...], changed_hot: {...}, needs_restart: [...]}
    """
    fresh = Settings()  # 重新读 env_file + 环境变量
    changed_hot: dict[str, object] = {}
    needs_restart: list[str] = []

    for name in Settings.model_fields:
        old = getattr(settings, name)
        new = getattr(fresh, name)
        if old == new:
            continue
        if name in RESTART_ONLY_FIELDS:
            needs_restart.append(name)
        else:
            setattr(settings, name, new)  # 原地更新热字段
            changed_hot[name] = "***(changed)" if _is_secret(name) else new

    return {
        "reloaded": sorted(changed_hot.keys()),
        "changed_hot": changed_hot,
        "needs_restart": sorted(needs_restart),
    }
