"""
Single Agent - LangGraph + Checkpoint + Tools
"""
from typing import AsyncGenerator
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.graph.message import MessagesState
from app.core.config import settings
import json
import urllib.parse
import urllib.request
import ssl


class SingleAgent:
    def __init__(self, session_id: str):
        # session_id 用于把“图的记忆（checkpoint）”绑定到一次会话
        # 同一个 session_id/ thread_id 重复调用时，LangGraph 会从 MemorySaver 中恢复上下文
        self.session_id = session_id
        self.llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=0.7,
            streaming=True,
        )
        # tools 是 Agent 可调用的函数列表（通过 @tool 包装，LangGraph 才能识别）
        self.tools = get_tools()
        # 给 LLM 绑定工具：模型输出 tool_calls 时，ToolNode 才能根据 name/args 执行
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        # checkpointer 用来保存 MessagesState（本示例用内存版，重启进程会丢失）
        self.checkpointer = MemorySaver()
        # graph 是一个“agent -> tools -> agent”的状态机
        self.graph = self._build_graph()

    def _build_graph(self):
        # ToolNode：把工具执行封装成一个图节点
        tool_node = ToolNode(self.tools)

        # MessagesState：LangGraph 内置状态结构，字段 messages 里存对话消息列表
        workflow = StateGraph(MessagesState)
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", tool_node)
        workflow.set_entry_point("agent")
        # tools_condition：如果 agent 输出里包含 tool_calls 就走 tools，否则结束
        workflow.add_conditional_edges("agent", tools_condition)
        # 工具执行后回到 agent，让模型读取工具结果继续生成
        workflow.add_edge("tools", "agent")
        return workflow.compile(checkpointer=self.checkpointer)

    async def _agent_node(self, state):
        # 让模型基于当前 messages 生成下一条 AIMessage（可能包含 tool_calls）
        response = await self.llm_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    async def stream(self, message: str, thread_id: str = None) -> AsyncGenerator[dict, None]:
        thread_id = thread_id or self.session_id
        # thread_id 是 LangGraph “可恢复记忆”的关键：同一个 thread_id 会串起同一会话
        config = {"configurable": {"thread_id": thread_id}}
        sys = SystemMessage(
            content=(
                "你是一个可调用工具的中文助手。遇到天气/出行/洗车等与天气相关的问题，必须先调用 get_weather(city) 获取数据后再给结论。"
                "回答时先给结论（适合/不适合/观望），再给 1-3 条依据（降雨概率/风速/降水量），最后附天气摘要。"
            )
        )
        messages = [sys, HumanMessage(content=message)]
        
        try:
            async for event in self.graph.astream_events(
                {"messages": messages},
                config=config, version="v1"
            ):
                # astream_events 会产出丰富的事件：
                # - on_chat_model_stream: 模型 token 流
                # - on_tool_start/on_tool_end: 工具开始/结束
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        yield {"type": "text", "content": content}
                elif kind == "on_tool_start":
                    tool_input = None
                    try:
                        tool_input = event.get("data", {}).get("input")
                    except Exception:
                        tool_input = None
                    yield {"type": "tool_calls", "data": {"name": event["name"], "input": tool_input}}
                elif kind == "on_tool_end":
                    tool_output = None
                    try:
                        tool_output = event.get("data", {}).get("output")
                    except Exception:
                        tool_output = None
                    if tool_output is not None:
                        try:
                            tool_output = tool_output.content  # ToolMessage / BaseMessage
                        except Exception:
                            tool_output = str(tool_output)
                    yield {"type": "tool_result", "data": {"name": event["name"], "output": tool_output}}
        except Exception as e:
            yield {"type": "error", "content": str(e)}
        
        yield {"type": "done", "content": ""}


# === Tools ===

@tool
def get_weather(city: str) -> str:
    """获取指定城市的天气信息（示例工具）。输入城市名称，返回天气字符串。"""
    aliases = {
        "上海": "Shanghai",
        "北京": "Beijing",
        "深圳": "Shenzhen",
        "广州": "Guangzhou",
        "杭州": "Hangzhou",
        "南京": "Nanjing",
        "成都": "Chengdu",
        "重庆": "Chongqing",
    }
    name = aliases.get(city.strip(), city.strip())

    def _get_json(url: str) -> dict:
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(url, headers={"User-Agent": "noah-agent-cli-learn/1.0"})
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)

    try:
        geo_url = (
            "https://geocoding-api.open-meteo.com/v1/search?"
            + urllib.parse.urlencode({"name": name, "count": 1, "language": "zh", "format": "json"})
        )
        geo = _get_json(geo_url)
        results = geo.get("results") or []
        if not results:
            return f"未找到城市：{city}"

        r0 = results[0]
        lat = r0.get("latitude")
        lon = r0.get("longitude")
        resolved = r0.get("name") or name
        tz = r0.get("timezone") or "Asia/Shanghai"

        forecast_url = (
            "https://api.open-meteo.com/v1/forecast?"
            + urllib.parse.urlencode(
                {
                    "latitude": lat,
                    "longitude": lon,
                    "current_weather": "true",
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max",
                    "timezone": tz,
                }
            )
        )
        fc = _get_json(forecast_url)
        daily = fc.get("daily") or {}

        def _pick(field: str):
            arr = daily.get(field) or []
            return arr[0] if arr else None

        tmax = _pick("temperature_2m_max")
        tmin = _pick("temperature_2m_min")
        pprob = _pick("precipitation_probability_max")
        psum = _pick("precipitation_sum")
        wmax = _pick("windspeed_10m_max")

        advice = []
        if pprob is not None:
            if float(pprob) <= 30:
                advice.append("降雨概率较低，通常适合洗车")
            elif float(pprob) <= 60:
                advice.append("降雨概率中等，建议观望或选择室内洗车")
            else:
                advice.append("降雨概率较高，不建议洗车")
        if wmax is not None and float(wmax) >= 10:
            advice.append("风较大，洗车后更容易落灰/留水痕")
        if psum is not None and float(psum) > 0:
            advice.append("预计有降水，洗车性价比偏低")

        current = fc.get("current_weather") or {}
        parts = [
            f"{resolved} 今日天气（Open-Meteo）：",
            f"- 气温：{tmin}°C ~ {tmax}°C" if (tmin is not None or tmax is not None) else "- 气温：未知",
            f"- 降雨概率（最高）：{pprob}%" if pprob is not None else "- 降雨概率：未知",
            f"- 预计降水量：{psum}mm" if psum is not None else "- 预计降水量：未知",
            f"- 最大风速：{wmax}m/s" if wmax is not None else "- 最大风速：未知",
        ]
        if current:
            cw_t = current.get("temperature")
            cw_w = current.get("windspeed")
            parts.append(f"- 当前：{cw_t}°C，风速 {cw_w}m/s" if (cw_t is not None or cw_w is not None) else "- 当前：未知")
        parts.append("洗车建议：" + ("；".join(advice) if advice else "信息不足，建议结合近 2–3 小时降雨雷达与未来 6 小时预报"))
        return "\n".join(parts)
    except Exception:
        data = {
            "Shanghai": {"tmin": 18, "tmax": 26, "pprob": 35, "psum": 0.2, "wmax": 5.0, "advice": "降雨概率中等，建议观望或选择室内洗车"},
            "Beijing": {"tmin": 12, "tmax": 22, "pprob": 10, "psum": 0.0, "wmax": 4.0, "advice": "降雨概率较低，通常适合洗车"},
            "Shenzhen": {"tmin": 24, "tmax": 30, "pprob": 60, "psum": 4.0, "wmax": 6.0, "advice": "降雨概率较高，不建议洗车"},
        }
        d = data.get(name)
        if not d:
            return f"天气查询失败：网络不可用，且无离线示例数据（city={city}）"
        return (
            f"{name} 今日天气（离线示例）：\n"
            f"- 气温：{d['tmin']}°C ~ {d['tmax']}°C\n"
            f"- 降雨概率（最高）：{d['pprob']}%\n"
            f"- 预计降水量：{d['psum']}mm\n"
            f"- 最大风速：{d['wmax']}m/s\n"
            f"洗车建议：{d['advice']}"
        )


@tool
def calculator(expr: str) -> str:
    """执行简单数学表达式计算（示例工具）。仅允许数字与 +-*/.() 空格。"""
    try:
        allowed = set("0123456789+-*/.() ")
        if set(expr) - allowed:
            return "Error: invalid chars"
        return str(eval(expr))
    except Exception as e:
        return f"Error: {e}"


@tool
def search_web(query: str) -> str:
    """联网搜索信息（示例工具）。输入关键词，返回搜索结果摘要字符串。"""
    return f"Search results for: {query} (Configure BRAVE_API_KEY for real search)"


def get_tools():
    return [get_weather, calculator, search_web]
