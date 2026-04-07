"""
Single Agent - LangGraph + Checkpoint + Tools
"""
from typing import AsyncGenerator
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.graph.message import MessagesState
from app.core.config import settings


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
        messages = [HumanMessage(content=message)]
        
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
                    yield {"type": "tool_calls", "data": {"name": event["name"]}}
                elif kind == "on_tool_end":
                    yield {"type": "tool_result", "data": {"done": True}}
        except Exception as e:
            yield {"type": "error", "content": str(e)}
        
        yield {"type": "done", "content": ""}


# === Tools ===

@tool
def get_weather(city: str) -> str:
    """获取指定城市的天气信息（示例工具）。输入城市名称，返回天气字符串。"""
    data = {"beijing": "Sunny, 15-25C", "shanghai": "Cloudy, 18-26C", "shenzhen": "Sunny, 22-30C"}
    return data.get(city.lower(), f"Weather for {city} not found")


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
