"""
HITL 人审闭环测试（M14 子目标 A）

- wrap_tool_with_approval：在最小图里验证 interrupt → approve 执行 / reject 取消
- apply_hitl / hitl_tool_names：名单匹配 + 开关
- StreamTask 审批等待/提交/超时
- approve 端点：未知任务 404
"""
import asyncio

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import StructuredTool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command

from app.core.hitl import wrap_tool_with_approval, apply_hitl, hitl_tool_names


async def _raw_transfer(amount: int) -> str:
    return f"DONE transfer {amount}"


_raw = StructuredTool.from_function(coroutine=_raw_transfer, name="transfer_money", description="转账")


def _build_graph(tool):
    async def agent_node(state):
        last = state["messages"][-1]
        if last.__class__.__name__ == "ToolMessage":
            return {"messages": [AIMessage(content=f"结果：{last.content}")]}
        return {"messages": [AIMessage(content="", tool_calls=[{"name": "transfer_money", "args": {"amount": 100}, "id": "c1"}])]}

    wf = StateGraph(MessagesState)
    wf.add_node("agent", agent_node)
    wf.add_node("tools", ToolNode([tool]))
    wf.set_entry_point("agent")
    wf.add_conditional_edges("agent", tools_condition)
    wf.add_edge("tools", "agent")
    return wf.compile(checkpointer=MemorySaver())


@pytest.mark.asyncio
async def test_interrupt_then_approve_executes():
    g = _build_graph(wrap_tool_with_approval(_raw))
    cfg = {"configurable": {"thread_id": "a1"}}
    async for _ in g.astream({"messages": [HumanMessage(content="转100")]}, config=cfg):
        pass
    st = await g.aget_state(cfg)
    assert st.interrupts, "应在工具执行前暂停等待审批"
    assert st.interrupts[0].value["tool"] == "transfer_money"
    assert st.interrupts[0].value["args"]["amount"] == 100

    async for _ in g.astream(Command(resume={"approved": True}), config=cfg):
        pass
    st2 = await g.aget_state(cfg)
    assert "DONE transfer 100" in st2.values["messages"][-1].content


@pytest.mark.asyncio
async def test_interrupt_then_reject_cancels():
    g = _build_graph(wrap_tool_with_approval(_raw))
    cfg = {"configurable": {"thread_id": "a2"}}
    async for _ in g.astream({"messages": [HumanMessage(content="转100")]}, config=cfg):
        pass
    async for _ in g.astream(Command(resume={"approved": False, "reason": "金额过大"}), config=cfg):
        pass
    st = await g.aget_state(cfg)
    final = st.values["messages"][-1].content
    assert ("取消" in final) or ("拒绝" in final)
    assert "DONE" not in final  # 真实工具未执行


def test_hitl_names_gated_by_flag(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "HITL_ENABLED", True)
    monkeypatch.setattr(settings, "HITL_APPROVAL_TOOLS", "transfer_money,delete_all_data")
    assert hitl_tool_names() == {"transfer_money", "delete_all_data"}
    monkeypatch.setattr(settings, "HITL_ENABLED", False)
    assert hitl_tool_names() == set()


def test_apply_hitl_wraps_only_listed(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "HITL_ENABLED", True)
    monkeypatch.setattr(settings, "HITL_APPROVAL_TOOLS", "transfer_money")

    async def _safe(x: str) -> str:
        return x
    safe = StructuredTool.from_function(coroutine=_safe, name="echo", description="echo")

    out = apply_hitl([_raw, safe])
    names = {t.name for t in out}
    assert names == {"transfer_money", "echo"}
    # echo 未被包装（原对象），transfer_money 被替换成包装版
    assert any(t is safe for t in out)
    assert all(t is not _raw for t in out)


def test_apply_hitl_disabled_returns_original(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "HITL_ENABLED", False)
    out = apply_hitl([_raw])
    assert out[0] is _raw


@pytest.mark.asyncio
async def test_stream_task_wait_then_submit():
    from app.core.task_stream import StreamTask
    t = StreamTask("tk1", "s1")

    async def waiter():
        return await t.wait_approval(timeout=5)

    fut = asyncio.create_task(waiter())
    await asyncio.sleep(0.05)
    assert t.awaiting_approval
    assert t.submit_approval({"approved": True}) is True
    res = await asyncio.wait_for(fut, timeout=2)
    assert res["approved"] is True


@pytest.mark.asyncio
async def test_stream_task_approval_timeout_rejects():
    from app.core.task_stream import StreamTask
    t = StreamTask("tk2", "s1")
    res = await t.wait_approval(timeout=0.05)
    assert res["approved"] is False
    assert not t.awaiting_approval


def test_submit_when_not_waiting_returns_false():
    from app.core.task_stream import StreamTask
    t = StreamTask("tk3", "s1")
    assert t.submit_approval({"approved": True}) is False


@pytest.mark.asyncio
async def test_approve_unknown_task_404(client):
    r = await client.post("/api/v1/chat/tasks/does_not_exist/approve", json={"approved": True})
    assert r.status_code == 404
