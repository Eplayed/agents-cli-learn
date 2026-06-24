"""
Per-User Token Quota（M10+ 成本治理）

参考 noah-chat-svc 的 QuotaConfig 设计：
- 按 user_id 统计每日 token 消耗
- 超过每日限额时拒绝请求（429 Too Many Requests）
- 白名单用户不受限制
- 配额可通过配置热更新（当前用 config.py 静态配置，未来可改 DB/Apollo）

设计简洁原则（学习项目）：
- 用进程内 dict 统计（重启清零，对学习项目够用）
- 不用 Redis（避免新增依赖）
- 每日 UTC 0:00 自动重置

使用方式：
    from app.core.quota import check_quota, record_usage

    # 请求前检查
    check_quota(user_id)  # 超限会抛 HTTPException 429

    # 请求后记录
    record_usage(user_id, total_tokens)
"""
import time
from typing import Optional

from fastapi import HTTPException, status

from app.core.config import settings


# ============================================================
# 配额存储（进程内，每日重置）
# 结构：{user_id: {"tokens": int, "day": str}}
# ============================================================
_USAGE: dict[str, dict] = {}


def _today() -> str:
    """UTC 日期字符串，用于判断是否跨天重置"""
    return time.strftime("%Y-%m-%d", time.gmtime())


def _get_user_usage(user_id: str) -> int:
    """获取用户今天已消耗的 token 数"""
    record = _USAGE.get(user_id)
    if not record or record.get("day") != _today():
        return 0
    return record.get("tokens", 0)


def _get_daily_limit(user_id: str) -> int:
    """获取用户每日 token 限额

    优先级：白名单（无限）→ 配置值

    配置项（config.py）：
    - QUOTA_DAILY_TOKENS: 每用户每天 token 上限（默认 500,000）
    - QUOTA_WHITELIST: 白名单 user_id 列表（不限额）
    """
    # 白名单用户不限
    whitelist = getattr(settings, "QUOTA_WHITELIST", "")
    if whitelist:
        wl = [u.strip() for u in whitelist.split(",") if u.strip()]
        if user_id in wl or "*" in wl:
            return -1  # -1 表示无限

    return getattr(settings, "QUOTA_DAILY_TOKENS", 500_000)


def check_quota(user_id: Optional[str]) -> None:
    """检查用户是否超限。超限时抛 429。

    如果 user_id 为 None（未鉴权/匿名），使用 "anonymous" 作为 key。
    """
    uid = user_id or "anonymous"
    limit = _get_daily_limit(uid)

    # -1 = 无限（白名单）
    if limit < 0:
        return

    used = _get_user_usage(uid)
    if used >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "type": "quota_exceeded",
                "content": f"今日 token 用量已达上限（{used:,}/{limit:,}）。配额每日 UTC 0:00 重置。",
                "usage": {"used": used, "limit": limit, "user_id": uid},
            },
        )


def record_usage(user_id: Optional[str], tokens: int) -> None:
    """记录用户本次消耗的 token 数"""
    if tokens <= 0:
        return

    uid = user_id or "anonymous"
    today = _today()
    record = _USAGE.get(uid)

    if not record or record.get("day") != today:
        # 新的一天，重置
        _USAGE[uid] = {"tokens": tokens, "day": today}
    else:
        record["tokens"] = record.get("tokens", 0) + tokens


def get_usage_info(user_id: Optional[str]) -> dict:
    """返回用户当前配额使用情况（供 API 查询）"""
    uid = user_id or "anonymous"
    limit = _get_daily_limit(uid)
    used = _get_user_usage(uid)
    return {
        "user_id": uid,
        "daily_limit": limit if limit >= 0 else "unlimited",
        "used_today": used,
        "remaining": (limit - used) if limit >= 0 else "unlimited",
        "reset_at": "UTC 00:00",
    }
