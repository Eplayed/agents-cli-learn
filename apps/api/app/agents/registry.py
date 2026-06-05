"""
Agent Registry — Agent 注册中心

为什么要注册中心？
- 加 Agent 不需要改路由代码
- 前端通过 /api/v1/agents 拿到列表，下拉切换
- 每个 Agent 代表一个"能力等级"，直观演示从 Chatbot 到生产 Agent 的进化
- 参考 agent-service-toolkit 的设计

使用方式：
    from app.agents.registry import get_agent, list_agents

    agent = get_agent("mcp-agent", session_id="xxx", model="gpt-4o-mini")
    async for chunk in agent.stream("你好"):
        ...
"""
from dataclasses import dataclass
from typing import Callable, Any


@dataclass
class AgentEntry:
    """注册表条目"""
    key: str              # URL 友好的标识（如 "basic-chatbot"）
    name: str             # 显示名（如 "M0 · 基础对话"）
    description: str      # 一句话描述
    milestone: str        # 对应学习阶段（M0/M1/M3/M4）
    factory: Callable     # 工厂函数：(session_id, model) -> agent 实例


# 注册表（有序，按学习阶段排列）
_REGISTRY: dict[str, AgentEntry] = {}


def register(key: str, name: str, description: str, milestone: str):
    """装饰器：注册一个 Agent 工厂函数"""
    def decorator(factory_fn: Callable):
        _REGISTRY[key] = AgentEntry(
            key=key,
            name=name,
            description=description,
            milestone=milestone,
            factory=factory_fn,
        )
        return factory_fn
    return decorator


def get_agent(key: str, session_id: str, model: str | None = None, checkpointer=None):
    """根据 key 创建 Agent 实例"""
    if key not in _REGISTRY:
        raise KeyError(f"Agent not found: {key}. Available: {list(_REGISTRY.keys())}")
    entry = _REGISTRY[key]
    return entry.factory(session_id=session_id, model=model, checkpointer=checkpointer)


def list_agents() -> list[dict]:
    """返回所有已注册 Agent 的元信息（供前端下拉用）"""
    return [
        {
            "key": e.key,
            "name": e.name,
            "description": e.description,
            "milestone": e.milestone,
        }
        for e in _REGISTRY.values()
    ]


def get_default_key() -> str:
    """返回默认 Agent key"""
    return "mcp-agent" if "mcp-agent" in _REGISTRY else list(_REGISTRY.keys())[0]
