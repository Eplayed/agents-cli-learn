"""
可观测性模块（M6）— Langfuse 集成

为什么要可观测？
- Agent 出错时能追踪"每一步做了什么"
- 定位问题是"工具返回了错数据"还是"LLM 幻觉了"
- 统计每次请求的 token 消耗和延迟

设计（参考 ToolHive + agent-service-toolkit）：
- 用 Langfuse 的 LangChain callback handler
- 在创建 LLM 时注入 callback → 自动记录所有 LLM 调用
- trace_id 通过 HTTP header 传递，贯穿全链路

使用方式：
    from app.core.tracing import get_langfuse_handler, is_tracing_enabled

    if is_tracing_enabled():
        handler = get_langfuse_handler(session_id=session.id, user_id="user123")
        # 传给 LLM 的 callbacks 参数
"""
import os
from typing import Optional
from app.core.config import settings


def is_tracing_enabled() -> bool:
    """检查 Langfuse 是否配置好（有 key 才启用）"""
    return bool(
        os.environ.get("LANGFUSE_PUBLIC_KEY") or
        getattr(settings, "LANGFUSE_PUBLIC_KEY", "")
    )


def get_langfuse_handler(
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    trace_name: Optional[str] = None,
    trace_id: Optional[str] = None,
):
    """创建 Langfuse LangChain callback handler。

    返回值可以直接传给 ChatOpenAI 的 callbacks 参数：
        llm = ChatOpenAI(..., callbacks=[handler])

    或者在 ainvoke 时传入：
        await llm.ainvoke(messages, config={"callbacks": [handler]})

    如果 Langfuse 未配置（没有 key），返回 None。

    M12 P1：把请求级 trace_id 写进 Langfuse trace 的 metadata + tags，
    这样"结构化日志里的 trace_id"和"Langfuse trace 详情页"能用同一个 ID 关联。
    """
    if not is_tracing_enabled():
        return None

    # 未显式传入 trace_id 时，从当前请求上下文（ContextVar）取
    if trace_id is None:
        try:
            from app.core.trace import get_trace_id
            trace_id = get_trace_id() or None
        except Exception:
            trace_id = None

    try:
        from langfuse.callback import CallbackHandler

        kwargs = dict(
            # Langfuse 从环境变量读 key：
            # LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
            session_id=session_id,
            user_id=user_id,
            trace_name=trace_name or "agent-chat",
        )
        if trace_id:
            # metadata 便于在 Langfuse 里按 trace_id 过滤/搜索；tags 便于快速筛选
            kwargs["metadata"] = {"trace_id": trace_id}
            kwargs["tags"] = [f"trace_id:{trace_id}"]

        handler = CallbackHandler(**kwargs)
        return handler
    except Exception as e:
        print(f"[Tracing] Langfuse handler 创建失败（不影响功能）: {e}")
        return None


def get_tracing_config(session_id: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    """返回可传给 LangGraph ainvoke/astream 的 config 追踪配置。

    如果 Langfuse 未启用，返回空 dict（不影响正常执行）。
    trace_id 由 get_langfuse_handler 从当前请求上下文自动读取并写入 metadata。
    """
    handler = get_langfuse_handler(session_id=session_id, user_id=user_id)
    if handler:
        return {"callbacks": [handler]}
    return {}
