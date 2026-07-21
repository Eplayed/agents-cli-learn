"""
HITL 人审闭环（M14 子目标 A）

给"需审批"的工具套一层审批包装器：工具执行前用 LangGraph interrupt() 暂停图，
等前端人工批准/拒绝后再 Command(resume=...) 恢复。批准则执行真实工具，拒绝则
返回取消说明、图继续。

为什么在主进程包装：dangerous 工具经 langchain-mcp-adapters 加载后，在主进程里也是
普通 BaseTool，可以直接包一层；interrupt() 在 ToolNode 执行的工具协程里可用（已 spike 验证）。
"""
from langchain_core.tools import BaseTool, StructuredTool
from langgraph.types import interrupt

from app.core.config import settings


def hitl_tool_names() -> set[str]:
    """需要人工审批的工具名集合（HITL 关闭时为空集）。"""
    if not getattr(settings, "HITL_ENABLED", False):
        return set()
    raw = getattr(settings, "HITL_APPROVAL_TOOLS", "") or ""
    return {w.strip() for w in raw.split(",") if w.strip()}


def needs_approval(tool_name: str) -> bool:
    return tool_name in hitl_tool_names()


def wrap_tool_with_approval(tool: BaseTool) -> BaseTool:
    """把一个工具包成"执行前先 interrupt 等人审"的版本。"""

    async def _approved(**kwargs):
        # interrupt 会暂停图；前端批准后 Command(resume=decision) 让它返回 decision
        decision = interrupt({"type": "approval_request", "tool": tool.name, "args": kwargs})
        approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
        if not approved:
            reason = decision.get("reason") if isinstance(decision, dict) else None
            tail = f"（原因：{reason}）" if reason else ""
            return f"❌ 操作已取消：用户未批准执行 {tool.name}{tail}。"
        return await tool.ainvoke(kwargs)

    return StructuredTool.from_function(
        coroutine=_approved,
        name=tool.name,
        description=tool.description,
        args_schema=tool.args_schema,
    )


def apply_hitl(tools: list[BaseTool]) -> list[BaseTool]:
    """对工具列表里命中审批名单的工具套上审批包装（不改其它工具）。"""
    names = hitl_tool_names()
    if not names:
        return tools
    return [wrap_tool_with_approval(t) if getattr(t, "name", None) in names else t for t in tools]
