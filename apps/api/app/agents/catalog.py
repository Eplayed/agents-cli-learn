"""
Agent Catalog — 注册所有可用的 Agent

每个 Agent 代表一个"能力等级"，对应一个学习阶段：
- M0 · basic-chatbot   : 纯 LLM 对话（不调工具）
- M3 · tool-agent      : 内嵌工具的 Agent（@tool 装饰器）
- M4 · mcp-agent       : MCP 协议工具（当前最完整版本）
- M4 · multi-agent     : Multi-Agent 团队协作

用户在 Web UI 切换 Agent = 切换不同阶段的能力，直观体验进化。
"""
from typing import AsyncGenerator

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

from app.agents.registry import register
from app.agents.single.agent import SingleAgent, _FALLBACK_CHECKPOINTER, _get_fallback_tools
from app.core.config import settings


def _build_human_message(message: str, images: list | None = None):
    """构建 HumanMessage：支持纯文本和多模态（文本 + 图片）"""
    from langchain_core.messages import HumanMessage
    if images:
        content_parts = [{"type": "text", "text": message}]
        for img in images[:3]:
            data_uri = f"data:{img.media_type};base64,{img.data}"
            content_parts.append({"type": "image_url", "image_url": {"url": data_uri}})
        return HumanMessage(content=content_parts)
    return HumanMessage(content=message)


async def _run_graph_with_events(agent, messages, config, model_name):
    """运行 agent.graph 的流式事件，统一处理 token 统计 + 事件转换。

    供 Skills/RAG/Full 三个 Wrapper 复用，保证它们也能上报 token_stats。
    返回一个 async generator，yield 统一格式的 chunk。
    """
    from app.core.token_tracker import TokenTracker, format_token_stats

    tracker = TokenTracker(model=model_name or settings.OPENAI_MODEL)
    config.setdefault("callbacks", []).append(tracker)

    try:
        async for event in agent.graph.astream_events(
            {"messages": messages}, config=config, version="v2"
        ):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                content = event["data"]["chunk"].content
                if content:
                    yield {"type": "text", "content": content}
            elif kind == "on_tool_start":
                yield {"type": "tool_calls", "data": {"name": event["name"], "input": event.get("data", {}).get("input")}}
            elif kind == "on_tool_end":
                tool_output = event.get("data", {}).get("output")
                from app.core.tool_output import normalize_tool_output
                normalized = normalize_tool_output(tool_output)
                yield {"type": "tool_result", "data": {"name": event["name"], **normalized}}
    except Exception as e:
        yield {"type": "error", "content": str(e)}

    yield {"type": "token_stats", "data": format_token_stats(tracker.get_stats())}
    yield {"type": "done", "content": ""}


# ============================================================
# M0 · Basic Chatbot（纯对话，不调工具）
# ============================================================

@register(
    key="basic-chatbot",
    name="M0 · 基础对话",
    description="纯 LLM 对话，不调用任何工具。体验 Chatbot 和 Agent 的区别。",
    milestone="M0",
)
def create_basic_chatbot(session_id: str, model: str | None = None, checkpointer=None):
    """最简单的 Chatbot：只有 LLM，没有工具，没有循环。

    用来演示"没有工具的 LLM 只能瞎编"——和 Agent 形成对比。
    """
    return BasicChatbot(session_id=session_id, model=model)


class BasicChatbot:
    """M0 能力：纯 LLM 对话（无工具、无 ReAct 循环）"""

    def __init__(self, session_id: str, model: str | None = None):
        self.session_id = session_id
        self.llm = ChatOpenAI(
            model=model or settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            temperature=0.7,
            streaming=True,
            stream_usage=True,              # 流式也返回 token usage
            request_timeout=settings.LLM_TIMEOUT,  # 防止模型不响应时永久挂起
        )

    async def stream(self, message: str, thread_id: str | None = None, images: list | None = None) -> AsyncGenerator[dict, None]:
        sys = SystemMessage(content="你是一个友好的中文助手。注意：你没有任何工具可用，只能基于自己的知识回答。如果用户问天气等实时信息，请诚实告知你无法查询。如果用户发送了图片，请仔细分析图片内容并结合文字回答。")
        messages = [sys, _build_human_message(message, images)]

        try:
            async for chunk in self.llm.astream(messages):
                if chunk.content:
                    yield {"type": "text", "content": chunk.content}
        except Exception as e:
            yield {"type": "error", "content": str(e)}

        yield {"type": "done", "content": ""}


# ============================================================
# M3 · Tool Agent（内嵌工具版，用 @tool 装饰器）
# ============================================================

@register(
    key="tool-agent",
    name="M3 · Tool Calling",
    description="带内嵌工具的 Agent（天气/计算/搜索），使用 LangGraph ReAct 循环。",
    milestone="M3",
)
def create_tool_agent(session_id: str, model: str | None = None, checkpointer=None):
    """内嵌工具版 Agent：用 @tool 装饰器定义工具，不走 MCP。

    演示 LangGraph 的 StateGraph + ToolNode + tools_condition 循环。
    """
    # 显式使用 fallback 工具（内嵌 @tool，不走 MCP）
    return SingleAgent(
        session_id=session_id,
        model=model,
        tools=_get_fallback_tools(),
        checkpointer=checkpointer,
    )


# ============================================================
# M4 · MCP Agent（MCP 协议工具版，当前主力）
# ============================================================

@register(
    key="mcp-agent",
    name="M4 · MCP Agent",
    description="通过 MCP 协议加载工具（天气/计算/搜索），工具和 Agent 完全解耦。",
    milestone="M4",
)
def create_mcp_agent(session_id: str, model: str | None = None, checkpointer=None):
    """MCP 版 Agent：工具通过 config.json 配置化加载。

    和 tool-agent 的区别：工具是独立进程，可被 Claude Desktop 等复用。
    """
    # 默认行为就是 MCP 优先 + fallback
    return SingleAgent(session_id=session_id, model=model, checkpointer=checkpointer)


# ============================================================
# M4 · Multi-Agent（团队协作）
# ============================================================

@register(
    key="multi-agent",
    name="M4 · Multi-Agent",
    description="多 Agent 团队协作（Sequential/Parallel/Supervisor/GroupChat）。",
    milestone="M4",
)
def create_multi_agent(session_id: str, model: str | None = None, checkpointer=None):
    """Multi-Agent 模式：多个 worker 协作完成任务。

    前端发消息时会自动用 Sequential 模式（研究员→作家→审稿人）。
    """
    return MultiAgentWrapper(session_id=session_id, model=model)


class MultiAgentWrapper:
    """包装 MultiAgentTeam，让接口和 SingleAgent 统一（都有 .stream）"""

    def __init__(self, session_id: str, model: str | None = None):
        self.session_id = session_id
        self.model = model

    async def stream(self, message: str, thread_id: str | None = None, images: list | None = None) -> AsyncGenerator[dict, None]:
        from app.agents.multi.team import MultiAgentTeam

        team = MultiAgentTeam(mode="sequential")
        try:
            async for chunk in team.execute_sequential(message):
                # 转换 multi-agent 的事件类型到统一格式
                if chunk["type"] == "summary":
                    yield {"type": "text", "content": chunk.get("content", "")}
                elif chunk["type"] in ("agent_start", "agent_thinking", "agent_done"):
                    yield {"type": "tool_calls", "data": {"name": f"[{chunk['type']}]", "input": chunk.get("content", "")}}
                else:
                    yield {"type": "text", "content": chunk.get("content", "")}
        except Exception as e:
            yield {"type": "error", "content": str(e)}

        yield {"type": "done", "content": ""}


# ============================================================
# M5 · HITL Agent（人工确认 + 预算控制演示）
# ============================================================

@register(
    key="hitl-agent",
    name="M5 · HITL Agent",
    description="带人工确认的 Agent：危险工具调用前会暂停等待用户确认，演示 interrupt 机制。",
    milestone="M5",
)
def create_hitl_agent(session_id: str, model: str | None = None, checkpointer=None):
    """HITL Agent：包含危险工具（删除/转账），调用前需确认。

    演示 LangGraph 的 interrupt() + recursion_limit 预算控制。
    危险工具定义在 dangerous_server.py（MCP）。
    """
    return SingleAgent(
        session_id=session_id,
        model=model,
        checkpointer=checkpointer,
    )


# ============================================================
# M6 · Traced Agent（带 Langfuse 追踪）
# ============================================================

@register(
    key="traced-agent",
    name="M6 · Traced Agent",
    description="带 Langfuse 可观测追踪的 Agent：每次调用自动记录 trace，可在 Langfuse 控制台查看完整执行树。",
    milestone="M6",
)
def create_traced_agent(session_id: str, model: str | None = None, checkpointer=None):
    """Traced Agent：和 MCP Agent 功能一样，但所有 LLM 调用和工具执行都会上报 Langfuse。

    需要配置 LANGFUSE_PUBLIC_KEY 和 LANGFUSE_SECRET_KEY 才能看到 trace。
    未配置时功能正常但不追踪。
    """
    return SingleAgent(
        session_id=session_id,
        model=model,
        checkpointer=checkpointer,
    )


# ============================================================
# M8 · Skills Agent（按需加载能力包）
# ============================================================

@register(
    key="skills-agent",
    name="M8 · Skills Agent",
    description="按需加载 Skills 能力包：根据用户消息自动匹配相关 Skill 注入 prompt。试试问天气或让它审查代码。",
    milestone="M8",
)
def create_skills_agent(session_id: str, model: str | None = None, checkpointer=None):
    """Skills Agent：根据对话内容动态加载匹配的 Skill 到 system prompt。

    Skills 定义在 skills/ 目录下：
    - skills/weather-advisor/SKILL.md（天气相关问题自动激活）
    - skills/code-reviewer/SKILL.md（代码相关问题自动激活）
    """
    return SkillsAgentWrapper(session_id=session_id, model=model, checkpointer=checkpointer)


class SkillsAgentWrapper:
    """带 Skills 的 Agent 包装器"""

    def __init__(self, session_id: str, model: str | None = None, checkpointer=None):
        self.session_id = session_id
        self.model = model
        self.checkpointer = checkpointer

    async def stream(self, message: str, thread_id: str | None = None, images: list | None = None):
        from app.core.skills import load_all_skills, match_skills, skills_to_prompt

        # 加载所有 skills（内置 + 已安装）并匹配
        all_skills = load_all_skills()
        matched = match_skills(message, all_skills)
        skill_prompt = skills_to_prompt(matched)

        # 创建带 skill prompt 的 agent
        agent = SingleAgent(
            session_id=self.session_id,
            model=self.model,
            checkpointer=self.checkpointer,
        )

        # 如果有匹配到的 skill，先 yield 一个提示事件
        if matched:
            skill_names = [s.name for s in matched]
            yield {"type": "tool_calls", "data": {"name": f"[Skills 激活: {', '.join(skill_names)}]", "input": None}}

        # 注入 skill 到消息（修改 system prompt）
        from langchain_core.messages import SystemMessage, HumanMessage

        original_stream = agent.stream
        # 重写 stream 的消息构造
        thread_id = thread_id or self.session_id
        config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": 25,
        }
        from app.core.tracing import get_tracing_config
        tracing = get_tracing_config(session_id=thread_id)
        if tracing:
            config.update(tracing)

        sys_content = (
            "你是一个可调用工具的中文助手。"
            + skill_prompt
        )
        messages = [SystemMessage(content=sys_content), _build_human_message(message, images)]

        async for chunk in _run_graph_with_events(agent, messages, config, self.model):
            yield chunk


# ============================================================
# M9 · RAG Agent（知识库检索增强）
# ============================================================

@register(
    key="rag-agent",
    name="M9 · RAG Agent",
    description="带知识库检索的 Agent：回答前先从项目文档中检索相关内容，基于真实知识回答并标注来源。",
    milestone="M9",
)
def create_rag_agent(session_id: str, model: str | None = None, checkpointer=None):
    """RAG Agent：先检索项目 docs/ 里的知识，再回答。

    适合问项目相关的技术问题（如"什么是 MCP""LangGraph 怎么用"）。
    """
    return RAGAgentWrapper(session_id=session_id, model=model, checkpointer=checkpointer)


class RAGAgentWrapper:
    """RAG Agent：检索 + 生成"""

    def __init__(self, session_id: str, model: str | None = None, checkpointer=None):
        self.session_id = session_id
        self.model = model
        self.checkpointer = checkpointer

    async def stream(self, message: str, thread_id: str | None = None, images: list | None = None):
        from app.core.rag import get_rag_retriever, format_rag_context
        from app.core.config import settings
        from langchain_core.messages import SystemMessage, HumanMessage

        # 1. 检索相关文档
        if not settings.ENABLE_RAG:
            yield {"type": "text", "content": "⚠️ RAG 知识库检索当前已关闭。\n\n如需启用，请在 `.env.dev` 中设置：\n```\nENABLE_RAG=true\n```\n然后重启服务。首次启用会下载约 90MB 的 embedding 模型。\n\n以下使用普通模式回答你的问题：\n\n"}

        retriever = get_rag_retriever()
        rag_context = ""
        if retriever:
            try:
                docs = await retriever.ainvoke(message)
                rag_context = format_rag_context(docs)
                if docs:
                    sources = [Path(d.metadata.get("source", "")).name for d in docs]
                    yield {"type": "tool_calls", "data": {"name": "[RAG 检索]", "input": f"找到 {len(docs)} 个相关片段: {sources}"}}
            except Exception as e:
                yield {"type": "tool_calls", "data": {"name": "[RAG 检索失败]", "input": str(e)}}

        # 2. 构建带 RAG 上下文的 agent
        agent = SingleAgent(
            session_id=self.session_id,
            model=self.model,
            checkpointer=self.checkpointer,
        )

        thread_id = thread_id or self.session_id
        config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": 25,
        }
        from app.core.tracing import get_tracing_config
        tracing = get_tracing_config(session_id=thread_id)
        if tracing:
            config.update(tracing)

        sys_content = (
            "你是一个可调用工具的中文助手。你有一个知识库可以参考。"
            "请基于知识库的内容回答，并在回答中标注引用编号如 [1][2]。"
            "如果知识库没有相关内容，就用你自己的知识回答并说明。"
            + rag_context
        )
        messages = [SystemMessage(content=sys_content), _build_human_message(message, images)]

        async for chunk in _run_graph_with_events(agent, messages, config, self.model):
            yield chunk


from pathlib import Path


# ============================================================
# M19 · Code Agent（本地编码 Agent，学习版）
# ============================================================

_CODE_AGENT_PROMPT = (
    "你是一个本地编码助手，只能在受限的工作区目录里操作。你有这些工具：\n"
    "- read_file / list_dir / grep_files：读代码、看目录、搜内容\n"
    "- write_file / str_replace_in_file：改代码（执行前会弹人工审批）\n"
    "- run_bash：跑命令如测试/构建（执行前会弹人工审批）\n\n"
    "工作方式（重要）：\n"
    "1. 先用 read_file/list_dir/grep_files 看清相关代码，别凭空改。\n"
    "2. 改动前先用一两句话说明你的计划（改哪个文件、为什么）。\n"
    "3. 用 write_file/str_replace_in_file 做最小改动；改完可用 run_bash 跑测试自检。\n"
    "4. 所有路径都是相对工作区的；不要尝试访问工作区外的文件（会被拒绝）。\n"
    "回答用中文。"
)


@register(
    key="code-agent",
    name="M19 · 编码 Agent",
    description="本地编码 Agent（学习版）：在受限工作区里读/改文件、跑命令，写文件和跑命令前需人工审批（复用 HITL）。",
    milestone="M19",
)
def create_code_agent(session_id: str, model: str | None = None, checkpointer=None):
    """编码 Agent：SingleAgent + 工作区受限的编码工具 + 编码系统提示。

    用 SingleAgent（而非 Wrapper）是为了复用其 interrupt 感知的 stream/resume，
    让 write_file/run_bash 的 HITL 审批闭环生效。
    """
    from app.core.coding_tools import get_coding_tools

    return SingleAgent(
        session_id=session_id,
        model=model,
        checkpointer=checkpointer,
        tools=get_coding_tools(),
        system_prompt=_CODE_AGENT_PROMPT,
    )


# ============================================================
# Full · 全功能 Agent（MCP + Skills + RAG + Tracing + 预算）
# ============================================================

@register(
    key="full-agent",
    name="Full · 全功能 Agent",
    description="整合所有能力：MCP 工具 + Skills 能力包 + RAG 知识库检索 + Langfuse 追踪 + 预算控制。这是 M0-M9 全部完成后的最终形态。",
    milestone="Full",
)
def create_full_agent(session_id: str, model: str | None = None, checkpointer=None):
    """全功能 Agent：M0-M9 所有能力集于一身。

    - MCP 工具（天气/计算/搜索）
    - Skills 按需加载（天气顾问/代码审查）
    - RAG 知识库检索（docs/*.md）
    - Langfuse 追踪（如果配了 key）
    - 预算控制（recursion_limit + max_tokens + timeout）
    - Checkpoint 持久化（重启不丢对话）
    """
    return FullAgentWrapper(session_id=session_id, model=model, checkpointer=checkpointer)


class FullAgentWrapper:
    """全功能 Agent：Skills + RAG + MCP + Tracing"""

    def __init__(self, session_id: str, model: str | None = None, checkpointer=None):
        self.session_id = session_id
        self.model = model
        self.checkpointer = checkpointer

    async def stream(self, message: str, thread_id: str | None = None, images: list | None = None):
        from app.core.skills import load_all_skills, match_skills, skills_to_prompt
        from app.core.rag import get_rag_retriever, format_rag_context
        from app.core.tracing import get_tracing_config
        from langchain_core.messages import SystemMessage, HumanMessage

        thread_id = thread_id or self.session_id

        # 1. Skills 匹配
        all_skills = load_all_skills()
        matched_skills = match_skills(message, all_skills)
        skill_prompt = skills_to_prompt(matched_skills)
        if matched_skills:
            skill_names = [s.name for s in matched_skills]
            yield {"type": "tool_calls", "data": {"name": f"[Skills 激活: {', '.join(skill_names)}]", "input": None}}

        # 2. RAG 检索
        rag_context = ""
        retriever = get_rag_retriever()
        if retriever:
            try:
                docs = await retriever.ainvoke(message)
                rag_context = format_rag_context(docs)
                if docs:
                    sources = [Path(d.metadata.get("source", "")).name for d in docs]
                    yield {"type": "tool_calls", "data": {"name": f"[RAG 检索: {len(docs)} 片段]", "input": sources}}
            except Exception as e:
                yield {"type": "tool_calls", "data": {"name": "[RAG]", "input": f"检索失败: {e}"}}

        # 3. 构建 system prompt（Skills + RAG 都注入）
        sys_content = (
            "你是一个全功能的中文 AI 助手。你同时具备：\n"
            "- 工具调用能力（天气查询、计算器、搜索）\n"
            "- 知识库检索能力（基于检索结果回答时请标注引用 [1][2]）\n"
            "- 专业 Skill 指导（按激活的 Skill 流程回答）\n\n"
            "优先使用工具获取实时数据，参考知识库补充背景知识。"
            + skill_prompt
            + ("\n\n" + rag_context if rag_context else "")
        )

        # 4. 创建 Agent 并执行
        agent = SingleAgent(
            session_id=self.session_id,
            model=self.model,
            checkpointer=self.checkpointer,
        )

        config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": 25,
        }
        tracing = get_tracing_config(session_id=thread_id)
        if tracing:
            config.update(tracing)

        messages = [SystemMessage(content=sys_content), _build_human_message(message, images)]

        async for chunk in _run_graph_with_events(agent, messages, config, self.model):
            yield chunk
