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
        self.session_id = session_id
        self.llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=0.7,
            streaming=True,
        )
        self.tools = get_tools()
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self):
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

    async def stream(self, message: str, thread_id: str = None) -> AsyncGenerator[dict, None]:
        thread_id = thread_id or self.session_id
        config = {"configurable": {"thread_id": thread_id}}
        messages = [HumanMessage(content=message)]
        
        try:
            async for event in self.graph.astream_events(
                {"messages": messages},
                config=config, version="v1"
            ):
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
