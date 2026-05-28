"""
Single Agent - LangGraph + Checkpoint + MCP Tools

工具加载策略（M4 改造后）：
1. 优先从 MCP Server 加载工具（mcp_servers/config.json）
2. MCP 加载失败时回退到内嵌工具（保证开发环境不会因为缺依赖就跑不起来）

为什么这样设计？
- 教学友好：你可以对比"内嵌工具"和"MCP 工具"的代码差异
- 容错：MCP 配置错误时，agent 仍能用内嵌工具运行
- 平滑迁移：现有调用方完全不需要改
"""
import json
import ssl
import urllib.parse
import urllib.request
from typing import AsyncGenerator, List

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

from app.core.config import settings


class SingleAgent:
    """单 Agent：LangGraph StateGraph + ToolNode + Checkpoint"""

    def __init__(self, session_id: str, tools: List[BaseTool] | None = None):
        # session_id 用于绑定 checkpoint 的 thread_id
        self.session_id = session_id
        self.llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=0.7,
            streaming=True,
        )

        # 工具来源（按优先级）：
        # 1. 调用方显式传入（测试/特殊场景用）
        # 2. 默认调 _resolve_tools()（先 MCP，失败回退内嵌）
        self.tools = tools if tools is not None else _resolve_tools_sync()

        # bind_tools：把工具的 schema 注入 LLM，模型才能输出 tool_calls
        self.llm_with_tools = self.llm.bind_tools(self.tools)

        # MemorySaver：内存版 checkpointer。
        # ⚠️ 重启进程会丢，M5 会替换成 AsyncSqliteSaver
        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self):
        # 经典的"agent → tools → agent"循环
        # tools_condition 是 LangGraph 内置的条件判断：
        # - 若 AIMessage 含 tool_calls → 走 tools 节点
        # - 否则 → END
        tool_node = ToolNode(self.tools)
        workflow = StateGraph(MessagesState)
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", tool_node)
        workflow.set_entry_point("agent")
        workflow.add_conditional_edges("agent", tools_condition)
        workflow.add_edge("tools", "agent")
        return workflow.compile(checkpointer=self.checkpointer)

    async def _agent_node(self, state):
        response = await self.llm_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    async def stream(self, message: str, thread_id: str | None = None) -> AsyncGenerator[dict, None]:
        thread_id = thread_id or self.session_id
        config = {"configurable": {"thread_id": thread_id}}
        sys = SystemMessage(
            content=(
                "你是一个可调用工具的中文助手。遇到天气/出行/洗车等与天气相关的问题，"
                "必须先调用 get_weather(city) 获取数据后再给结论。"
                "回答时先给结论（适合/不适合/观望），再给 1-3 条依据（降雨概率/风速/降水量），最后附天气摘要。"
            )
        )
        messages = [sys, HumanMessage(content=message)]

        try:
            async for event in self.graph.astream_events(
                {"messages": messages}, config=config, version="v1"
            ):
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        yield {"type": "text", "content": content}
                elif kind == "on_tool_start":
                    tool_input = event.get("data", {}).get("input")
                    yield {"type": "tool_calls", "data": {"name": event["name"], "input": tool_input}}
                elif kind == "on_tool_end":
                    tool_output = event.get("data", {}).get("output")
                    if tool_output is not None:
                        try:
                            tool_output = tool_output.content  # ToolMessage / BaseMessage
                        except Exception:
                            tool_output = str(tool_output)
                    yield {"type": "tool_result", "data": {"name": event["name"], "output": tool_output}}
        except Exception as e:
            yield {"type": "error", "content": str(e)}

        yield {"type": "done", "content": ""}


# ============================================================
# 工具加载：MCP 优先，失败回退内嵌
# ============================================================

def _resolve_tools_sync() -> List[BaseTool]:
    """同步入口：尝试加载 MCP 工具，失败回退到内嵌工具。
    
    为什么用同步入口？
    - SingleAgent.__init__ 是同步的（FastAPI 路由按需创建）
    - MCP 加载是 async 的，所以这里用 asyncio.run/get_event_loop 适配
    
    生产改造方向（M5）：
    - 让 agent 在 lifespan 里一次性加载，而不是每次请求都加载
    - 用 app.state.mcp_tools 全局共享
    """
    import asyncio

    try:
        from app.mcp_servers.loader import get_mcp_tools

        # 适配同步上下文：
        # - 如果当前没有事件循环（如脚本启动），用 asyncio.run
        # - 如果在事件循环里（FastAPI 请求），用 nest_asyncio 或新建 loop
        try:
            loop = asyncio.get_running_loop()
            # 已在事件循环里 → 用 run_in_executor 创建新 loop 跑
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                tools = pool.submit(asyncio.run, get_mcp_tools()).result(timeout=30)
        except RuntimeError:
            # 没有运行中的 loop → 直接 asyncio.run
            tools = asyncio.run(get_mcp_tools())

        if tools:
            return tools
    except Exception as e:
        # 加载失败要明显提示，但不要让整个 API 挂掉
        print(f"[SingleAgent] MCP 工具加载失败，回退到内嵌工具: {e}")

    return _get_fallback_tools()


def _get_fallback_tools() -> List[BaseTool]:
    """内嵌工具（回退用）。
    
    设计为完全独立的实现：
    - MCP 不可用时仍能跑
    - 方便对照学习"内嵌 vs MCP"
    """
    return [_get_weather_fallback, _calculator_fallback, _search_web_fallback]


@tool
def _get_weather_fallback(city: str) -> str:
    """获取指定城市的天气信息（内嵌回退版本）。输入城市名称，返回天气字符串。"""
    aliases = {"上海": "Shanghai", "北京": "Beijing", "深圳": "Shenzhen", "广州": "Guangzhou"}
    name = aliases.get(city.strip(), city.strip())

    try:
        ctx = ssl._create_unverified_context()

        def _get_json(url: str) -> dict:
            req = urllib.request.Request(url, headers={"User-Agent": "noah-agent/1.0"})
            with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))

        geo = _get_json(
            "https://geocoding-api.open-meteo.com/v1/search?"
            + urllib.parse.urlencode({"name": name, "count": 1, "language": "zh"})
        )
        results = geo.get("results") or []
        if not results:
            return f"未找到城市：{city}"
        r0 = results[0]
        fc = _get_json(
            "https://api.open-meteo.com/v1/forecast?"
            + urllib.parse.urlencode({
                "latitude": r0.get("latitude"),
                "longitude": r0.get("longitude"),
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
                "timezone": r0.get("timezone") or "Asia/Shanghai",
            })
        )
        d = fc.get("daily") or {}
        return (
            f"{r0.get('name')} 天气：{d.get('temperature_2m_min', [None])[0]}°C ~ "
            f"{d.get('temperature_2m_max', [None])[0]}°C，"
            f"降雨概率 {d.get('precipitation_probability_max', [None])[0]}%"
        )
    except Exception as e:
        return f"天气查询失败：{e}"


@tool
def _calculator_fallback(expr: str) -> str:
    """简单数学表达式（内嵌回退版本）。仅允许数字与 +-*/.() 空格。"""
    try:
        allowed = set("0123456789+-*/.() ")
        if set(expr) - allowed:
            return "Error: invalid chars"
        return str(eval(expr))
    except Exception as e:
        return f"Error: {e}"


@tool
def _search_web_fallback(query: str) -> str:
    """联网搜索（内嵌回退版本，占位实现）。"""
    return f"Search results for: {query} (Configure BRAVE_API_KEY for real search)"
