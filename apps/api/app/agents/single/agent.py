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


# ============================================================
# M5 Checkpointer 策略
# ============================================================
# 优先级：
# 1. 从 app.state.checkpointer 获取（lifespan 注入的 AsyncSqliteSaver）
# 2. 回退到模块级 MemorySaver（兼容没跑 lifespan 的场景，如单元测试）
#
# AsyncSqliteSaver 的好处：
# - 重启进程后 thread_id 对应的对话历史仍在（持久化到 checkpoints.db）
# - 相比 MemorySaver：从"进程内有效"升级到"跨重启有效"
_FALLBACK_CHECKPOINTER = MemorySaver()


def _get_checkpointer(explicit=None):
    """获取 checkpointer，优先用 lifespan 注入的持久化版本"""
    if explicit is not None:
        return explicit
    # 尝试从 FastAPI app.state 获取（需要在请求上下文中）
    try:
        from fastapi import Request
        # 这里不能直接拿 app.state，因为不在请求上下文
        # 所以调用方（chat.py）会显式传入 request.app.state.checkpointer
        pass
    except Exception:
        pass
    return _FALLBACK_CHECKPOINTER


# ============================================================
# 预算控制常量（M5）
# ============================================================
# recursion_limit：图最多执行多少步节点就强制停止（防 LLM 死循环）
RECURSION_LIMIT = 25

# max_tokens：单次 LLM 生成最大 token 数（防超长输出烧钱）
MAX_TOKENS = 4096

# request_timeout：单次 LLM API 调用超时（秒），防卡死
REQUEST_TIMEOUT = 60


class SingleAgent:
    """单 Agent：LangGraph StateGraph + ToolNode + Checkpoint + 预算控制"""

    def __init__(
        self,
        session_id: str,
        tools: List[BaseTool] | None = None,
        model: str | None = None,
        checkpointer=None,
    ):
        # session_id 用于绑定 checkpoint 的 thread_id
        self.session_id = session_id
        # model 参数：前端可传指定模型，不传则用 config 默认值
        model_name = model or settings.OPENAI_MODEL
        self.llm = ChatOpenAI(
            model=model_name,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=0.7,
            streaming=True,
            stream_usage=True,              # M10：流式也返回 token usage
            max_tokens=MAX_TOKENS,          # M5：限制单次生成长度
            request_timeout=REQUEST_TIMEOUT,  # M5：超时保护
        )

        # 工具来源（按优先级）：
        # 1. 调用方显式传入（测试/特殊场景用）
        # 2. 默认调 _resolve_tools()（先 MCP，失败回退内嵌）
        self.tools = tools if tools is not None else _resolve_tools_sync()

        # bind_tools：把工具的 schema 注入 LLM，模型才能输出 tool_calls
        self.llm_with_tools = self.llm.bind_tools(self.tools)

        # Checkpointer：优先用调用方传入的（从 lifespan 注入的 AsyncSqliteSaver）
        self.checkpointer = checkpointer if checkpointer is not None else _FALLBACK_CHECKPOINTER
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

    async def stream(self, message: str, thread_id: str | None = None, images: list | None = None) -> AsyncGenerator[dict, None]:
        thread_id = thread_id or self.session_id
        config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": RECURSION_LIMIT,  # M5：防 LLM 死循环
        }

        # M6：注入 Langfuse tracing（如果配置了的话）
        from app.core.tracing import get_tracing_config
        tracing = get_tracing_config(session_id=thread_id)
        if tracing:
            config.update(tracing)

        # M10：Token 统计
        from app.core.token_tracker import TokenTracker
        model_name = self.llm.model_name if hasattr(self.llm, 'model_name') else settings.OPENAI_MODEL
        self._token_tracker = TokenTracker(model=model_name)
        if "callbacks" not in config:
            config["callbacks"] = []
        config["callbacks"].append(self._token_tracker)

        sys = SystemMessage(
            content=(
                "你是一个可调用工具的中文助手。遇到天气/出行/洗车等与天气相关的问题，"
                "必须先调用 get_weather(city) 获取数据后再给结论。"
                "回答时先给结论（适合/不适合/观望），再给 1-3 条依据（降雨概率/风速/降水量），最后附天气摘要。"
                "如果用户发送了图片，请仔细分析图片内容并结合文字回答。"
            )
        )

        # 构建 HumanMessage：支持多模态（文本 + 图片）
        if images:
            # 多模态格式：content 是 list[dict]
            content_parts = [{"type": "text", "text": message}]
            for img in images[:3]:  # 最多 3 张
                data_uri = f"data:{img.media_type};base64,{img.data}"
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": data_uri}
                })
            human_msg = HumanMessage(content=content_parts)
        else:
            human_msg = HumanMessage(content=message)

        messages = [sys, human_msg]

        # --- 输入长度预检：估算 token 数，超限时提前拒绝 ---
        # 粗略估算：中文 1 字符 ≈ 1.5 token，英文 1 word ≈ 1.3 token
        # 这里用简单的字符数 / 2 估算（偏保守）
        MAX_CONTEXT_TOKENS = 30000  # 留 2K 给输出
        text_content = message if isinstance(message, str) else str(message)
        estimated_input_tokens = len(text_content) // 2 + 200  # +200 for system prompt
        if estimated_input_tokens > MAX_CONTEXT_TOKENS:
            yield {"type": "error", "content": f"输入过长（约 {estimated_input_tokens} tokens，上限 {MAX_CONTEXT_TOKENS}）。请精简内容后重试。"}
            yield {"type": "done", "content": ""}
            return

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
            err_msg = str(e)
            # 捕获 context_length_exceeded：提示用户并建议新建会话
            if "context_length" in err_msg.lower() or "maximum context" in err_msg.lower() or "too many tokens" in err_msg.lower():
                yield {"type": "error", "content": "对话历史过长，已超出模型上下文窗口限制。建议新建 Session 开始新对话。"}
            else:
                yield {"type": "error", "content": err_msg}

        # M10：返回 token 统计（如果有）
        if hasattr(self, '_token_tracker') and self._token_tracker:
            from app.core.token_tracker import format_token_stats
            stats = self._token_tracker.get_stats()
            yield {"type": "token_stats", "data": format_token_stats(stats)}

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
