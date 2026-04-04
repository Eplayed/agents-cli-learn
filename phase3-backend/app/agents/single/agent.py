"""
Single Agent - LangGraph + Checkpoint + Tools
"""
import json
from typing import AsyncGenerator
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode
from app.core.config import settings


class AgentState(dict):
    messages: list
    session_id: str


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
        self.tool_node = ToolNode(self.tools)
        self.llm_with_tools = self.llm.bind_tools(self.tools)
        self.checkpointer = MemorySaver()
        self.graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(AgentState)
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", self._tools_node)
        workflow.set_entry_point("agent")
        workflow.add_conditional_edges("agent", self._should_continue, {"continue": "tools", "end": END})
        workflow.add_edge("tools", "agent")
        return workflow.compile(checkpointer=self.checkpointer)

    async def _agent_node(self, state):
        response = await self.llm_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}

    async def _tools_node(self, state):
        tool_calls = state.get("tool_calls", [])
        if not tool_calls:
            return {}
        results = await self.tool_node.ainvoke(tool_calls)
        for result in results:
            if hasattr(result, "content"):
                state["messages"].append({"role": "tool", "content": str(result.content)})
        return {"messages": state["messages"]}

    def _should_continue(self, state):
        last = state["messages"][-1] if state["messages"] else None
        if last and hasattr(last, "tool_calls") and last.tool_calls:
            return "continue"
        return "end"

    async def stream(self, message: str, thread_id: str = None) -> AsyncGenerator[dict, None]:
        thread_id = thread_id or self.session_id
        config = {"configurable": {"thread_id": thread_id}}
        messages = [HumanMessage(content=message)]
        
        try:
            async for event in self.graph.astream_events(
                {"messages": messages, "session_id": self.session_id},
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
def get_weather(city: str) -> str:
    data = {"beijing": "Sunny, 15-25C", "shanghai": "Cloudy, 18-26C", "shenzhen": "Sunny, 22-30C"}
    return data.get(city.lower(), f"Weather for {city} not found")

def calculator(expr: str) -> str:
    try:
        allowed = set("0123456789+-*/.() ")
        if set(expr) - allowed:
            return "Error: invalid chars"
        return str(eval(expr))
    except Exception as e:
        return f"Error: {e}"

def search_web(query: str) -> str:
    return f"Search results for: {query} (Configure BRAVE_API_KEY for real search)"


def get_tools():
    return [get_weather, calculator, search_web]
