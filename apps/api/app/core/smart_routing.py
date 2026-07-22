"""M17 智能路由（学习版）。

不用 LLM 做分类，先用可解释关键词路由，保证离线可测。
"""
from __future__ import annotations

from app.core.config import settings


def route_agent(message: str, requested_agent: str | None = None) -> tuple[str | None, str]:
    if requested_agent or not settings.SMART_ROUTING_ENABLED:
        return requested_agent, "explicit_or_disabled"

    text = (message or "").lower()
    code_hits = ("代码", "bug", "报错", "实现", "重构", "测试", "npm", "pytest", "文件", "git", "api")
    rag_hits = ("文档", "资料", "知识库", "解释", "架构", "学习计划", "mcp 是什么")
    schedule_hits = ("定时", "每天", "每周", "提醒", "周期", "任务")

    if any(k in text for k in schedule_hits):
        return "mcp-agent", "scheduled_intent"
    if any(k in text for k in code_hits):
        return "code-agent", "code_keywords"
    if any(k in text for k in rag_hits):
        return "rag-agent", "rag_keywords"
    return None, "default"
