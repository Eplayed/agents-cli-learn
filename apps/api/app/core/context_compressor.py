"""
对话上下文压缩（M10）

参考 Claude Code 的三层记忆模型：
- Layer 1: 固定指令（System Prompt，永远在）
- Layer 2: 最近 N 轮完整保留（短期记忆窗口）
- Layer 3: 旧对话自动生成摘要（中期记忆）

策略：
- 对话历史超过 MAX_MESSAGES 条时触发压缩
- 保留最近 WINDOW_SIZE 条消息
- 旧消息用 LLM 生成摘要（一段话总结要点）
- 摘要作为 SystemMessage 注入，替代旧消息

使用方式：
    from app.core.context_compressor import compress_messages

    messages = compress_messages(messages, llm)
"""
from typing import List
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage, AIMessage


# 配置
WINDOW_SIZE = 20        # 保留最近 20 条消息（约 10 轮对话）
MAX_MESSAGES = 30       # 超过 30 条时触发压缩
SUMMARY_MAX_TOKENS = 300  # 摘要最多 300 token


async def compress_messages(
    messages: List[BaseMessage],
    llm=None,
) -> List[BaseMessage]:
    """压缩对话历史。

    如果消息数 <= MAX_MESSAGES，不做任何处理直接返回。
    如果超过，把旧消息压缩成摘要 + 保留最近 WINDOW_SIZE 条。

    Args:
        messages: 当前全部消息列表
        llm: 用于生成摘要的 LLM（传 None 则用简单截断不生成摘要）

    Returns:
        压缩后的消息列表（总长度 <= WINDOW_SIZE + 1）
    """
    if len(messages) <= MAX_MESSAGES:
        return messages  # 不需要压缩

    # 分离：system 消息 + 其余
    system_msgs = [m for m in messages if isinstance(m, SystemMessage)]
    non_system = [m for m in messages if not isinstance(m, SystemMessage)]

    if len(non_system) <= WINDOW_SIZE:
        return messages  # 去掉 system 后不够长，不压缩

    # 要压缩的旧消息
    old_messages = non_system[:-WINDOW_SIZE]
    recent_messages = non_system[-WINDOW_SIZE:]

    # 生成摘要
    summary_text = await _generate_summary(old_messages, llm)

    # 组装：system + 摘要 + 最近消息
    result = system_msgs.copy()
    if summary_text:
        result.append(SystemMessage(content=f"[对话历史摘要] {summary_text}"))
    result.extend(recent_messages)

    return result


async def _generate_summary(messages: List[BaseMessage], llm=None) -> str:
    """用 LLM 生成对话摘要。如果没有 LLM 则用简单提取。"""

    # 把消息转成文本
    text_parts = []
    for m in messages:
        role = "用户" if isinstance(m, HumanMessage) else "助手"
        content = m.content[:200] if m.content else ""
        if content:
            text_parts.append(f"{role}: {content}")

    conversation_text = "\n".join(text_parts[-20:])  # 最多取 20 条做摘要

    if not conversation_text:
        return ""

    # 如果有 LLM，用它生成摘要
    if llm:
        try:
            summary_prompt = (
                "请用 2-3 句话总结以下对话的关键要点（包括用户的偏好、提到的关键信息、达成的结论）：\n\n"
                f"{conversation_text}\n\n"
                "摘要："
            )
            response = await llm.ainvoke([HumanMessage(content=summary_prompt)])
            return response.content[:500]  # 限制摘要长度
        except Exception:
            pass

    # fallback：简单提取（不调 LLM）
    key_points = []
    for m in messages:
        if isinstance(m, HumanMessage) and m.content:
            key_points.append(m.content[:50])
    return "用户之前讨论了：" + "；".join(key_points[-5:])


def estimate_tokens(messages: List[BaseMessage]) -> int:
    """粗略估算消息列表的 token 数（中文约 1.5 字/token，英文约 4 字符/token）"""
    total_chars = sum(len(m.content or "") for m in messages)
    # 粗略：中英混合按 2 字符/token 估算
    return total_chars // 2
