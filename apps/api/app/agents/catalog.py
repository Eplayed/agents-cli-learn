"""
Agent Catalog — 注册所有可用的 Agent

每个 Agent 代表一个"能力等级"，对应一个学习阶段：
- M0 · basic-chatbot   : 纯 LLM 对话（不调工具）
- M3 · tool-agent      : 内嵌工具的 Agent（@tool 装饰器）
- M4 · mcp-agent       : MCP 协议工具（当前最完整版本）
- M4 · multi-agent     : Multi-Agent 团队协作

用户在 Web UI 切换 Agent = 切换不同阶段的能力，直观体验进化。
"""
from typing import AsyncGenerator

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

from app.agents.registry import register
from app.agents.single.agent import SingleAgent, _FALLBACK_CHECKPOINTER, _get_fallback_tools
from app.core.config import settings


# ============================================================
# M0 · Basic Chatbot（纯对话，不调工具）
# ============================================================

@register(
    key="basic-chatbot",
    name="M0 · 基础对话",
    description="纯 LLM 对话，不调用任何工具。体验 Chatbot 和 Agent 的区别。",
    milestone="M0",
)
def create_basic_chatbot(session_id: str, model: str | None = None, checkpointer=None):
    """最简单的 Chatbot：只有 LLM，没有工具，没有循环。

    用来演示"没有工具的 LLM 只能瞎编"——和 Agent 形成对比。
    """
    return BasicChatbot(session_id=session_id, model=model)


class BasicChatbot:
    """M0 能力：纯 LLM 对话（无工具、无 ReAct 循环）"""

    def __init__(self, session_id: str, model: str | None = None):
        self.session_id = session_id
        self.llm = ChatOpenAI(
            model=model or settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=0.7,
            streaming=True,
        )

    async def stream(self, message: str, thread_id: str | None = None) -> AsyncGenerator[dict, None]:
        sys = SystemMessage(content="你是一个友好的中文助手。注意：你没有任何工具可用，只能基于自己的知识回答。如果用户问天气等实时信息，请诚实告知你无法查询。")
        messages = [sys, HumanMessage(content=message)]

        try:
            async for chunk in self.llm.astream(messages):
                if chunk.content:
                    yield {"type": "text", "content": chunk.content}
        except Exception as e:
            yield {"type": "error", "content": str(e)}

        yield {"type": "done", "content": ""}


# ============================================================
# M3 · Tool Agent（内嵌工具版，用 @tool 装饰器）
# ============================================================

@register(
    key="tool-agent",
    name="M3 · Tool Calling",
    description="带内嵌工具的 Agent（天气/计算/搜索），使用 LangGraph ReAct 循环。",
    milestone="M3",
)
def create_tool_agent(session_id: str, model: str | None = None, checkpointer=None):
    """内嵌工具版 Agent：用 @tool 装饰器定义工具，不走 MCP。

    演示 LangGraph 的 StateGraph + ToolNode + tools_condition 循环。
    """
    # 显式使用 fallback 工具（内嵌 @tool，不走 MCP）
    return SingleAgent(
        session_id=session_id,
        model=model,
        tools=_get_fallback_tools(),
        checkpointer=checkpointer,
    )


# ============================================================
# M4 · MCP Agent（MCP 协议工具版，当前主力）
# ============================================================

@register(
    key="mcp-agent",
    name="M4 · MCP Agent",
    description="通过 MCP 协议加载工具（天气/计算/搜索），工具和 Agent 完全解耦。",
    milestone="M4",
)
def create_mcp_agent(session_id: str, model: str | None = None, checkpointer=None):
    """MCP 版 Agent：工具通过 config.json 配置化加载。

    和 tool-agent 的区别：工具是独立进程，可被 Claude Desktop 等复用。
    """
    # 默认行为就是 MCP 优先 + fallback
    return SingleAgent(session_id=session_id, model=model, checkpointer=checkpointer)


# ============================================================
# M4 · Multi-Agent（团队协作）
# ============================================================

@register(
    key="multi-agent",
    name="M4 · Multi-Agent",
    description="多 Agent 团队协作（Sequential/Parallel/Supervisor/GroupChat）。",
    milestone="M4",
)
def create_multi_agent(session_id: str, model: str | None = None, checkpointer=None):
    """Multi-Agent 模式：多个 worker 协作完成任务。

    前端发消息时会自动用 Sequential 模式（研究员→作家→审稿人）。
    """
    return MultiAgentWrapper(session_id=session_id, model=model)


class MultiAgentWrapper:
    """包装 MultiAgentTeam，让接口和 SingleAgent 统一（都有 .stream）"""

    def __init__(self, session_id: str, model: str | None = None):
        self.session_id = session_id
        self.model = model

    async def stream(self, message: str, thread_id: str | None = None) -> AsyncGenerator[dict, None]:
        from app.agents.multi.team import MultiAgentTeam

        team = MultiAgentTeam(mode="sequential")
        try:
            async for chunk in team.execute_sequential(message):
                # 转换 multi-agent 的事件类型到统一格式
                if chunk["type"] == "summary":
                    yield {"type": "text", "content": chunk.get("content", "")}
                elif chunk["type"] in ("agent_start", "agent_thinking", "agent_done"):
                    yield {"type": "tool_calls", "data": {"name": f"[{chunk['type']}]", "input": chunk.get("content", "")}}
                else:
                    yield {"type": "text", "content": chunk.get("content", "")}
        except Exception as e:
            yield {"type": "error", "content": str(e)}

        yield {"type": "done", "content": ""}


# ============================================================
# M5 · HITL Agent（人工确认 + 预算控制演示）
# ============================================================

@register(
    key="hitl-agent",
    name="M5 · HITL Agent",
    description="带人工确认的 Agent：危险工具调用前会暂停等待用户确认，演示 interrupt 机制。",
    milestone="M5",
)
def create_hitl_agent(session_id: str, model: str | None = None, checkpointer=None):
    """HITL Agent：包含危险工具（删除/转账），调用前需确认。

    演示 LangGraph 的 interrupt() + recursion_limit 预算控制。
    危险工具定义在 dangerous_server.py（MCP）。
    """
    return SingleAgent(
        session_id=session_id,
        model=model,
        checkpointer=checkpointer,
    )


# ============================================================
# M6 · Traced Agent（带 Langfuse 追踪）
# ============================================================

@register(
    key="traced-agent",
    name="M6 · Traced Agent",
    description="带 Langfuse 可观测追踪的 Agent：每次调用自动记录 trace，可在 Langfuse 控制台查看完整执行树。",
    milestone="M6",
)
def create_traced_agent(session_id: str, model: str | None = None, checkpointer=None):
    """Traced Agent：和 MCP Agent 功能一样，但所有 LLM 调用和工具执行都会上报 Langfuse。

    需要配置 LANGFUSE_PUBLIC_KEY 和 LANGFUSE_SECRET_KEY 才能看到 trace。
    未配置时功能正常但不追踪。
    """
    return SingleAgent(
        session_id=session_id,
        model=model,
        checkpointer=checkpointer,
    )
