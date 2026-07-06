// 真实项目代码片段：按 question id 映射到项目里的实际代码
//
// 这些片段直接来自 apps/api 的源码，用于在「学习模式」里把面试题和项目代码对照讲解。
// 没有对应代码片段的题（如系统设计、STAR 表达等抽象题）会只展示 projectMapping 文字。
//
// 字段：file（文件路径）, lang（语言）, code（代码片段）, note（讲解）

export const CODE_SNIPPETS = {
  // ===== Agent 核心 =====
  ia01: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `def _build_graph(self):
    # 经典的 "agent → tools → agent" 循环
    tool_node = ToolNode(self.tools)
    workflow = StateGraph(MessagesState)
    workflow.add_node("agent", self._agent_node)
    workflow.add_node("tools", tool_node)
    workflow.set_entry_point("agent")
    # tools_condition：AIMessage 含 tool_calls 走 tools，否则 END
    workflow.add_conditional_edges("agent", tools_condition)
    workflow.add_edge("tools", "agent")
    return workflow.compile(checkpointer=self.checkpointer)`,
    note: '整个 _build_graph 就是 Agent「感知-决策-行动」循环的工程实现。agent 节点负责决策（LLM 推理），tools 节点负责行动（工具调用），两者循环直到 LLM 不再需要工具。',
  },
  ia02: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `workflow.add_conditional_edges("agent", tools_condition)
workflow.add_edge("tools", "agent")
# agent → (有 tool_calls?) → tools → agent → ... → END
# 这就是 ReAct 的 Thought → Action → Observation → Loop`,
    note: 'add_conditional_edges("agent", tools_condition) 就是 ReAct 的「循环判断」：LLM 输出 tool_calls 则走 tools（Action+Observation），否则结束。tools→agent 的边让 Observation 回流给下一轮 Thought。',
  },
  ia03: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `async def _agent_node(self, state):
    # llm_with_tools 产出的 AIMessage 可能含 tool_calls
    # 但工具的实际执行不在这里，而在 ToolNode
    response = await self.llm_with_tools.ainvoke(state["messages"])
    return {"messages": [response]}`,
    note: 'Function Calling 的本质：模型输出「调用意图」（tool_calls 结构），实际执行由 ToolNode 完成。模型和执行解耦——这正是可以在执行前插入 HITL 审批的原因。',
  },
  ia04: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `# bind_tools：把工具的 schema 注入 LLM，模型才能输出 tool_calls
self.llm_with_tools = self.llm.bind_tools(self.tools)`,
    note: 'bind_tools 把工具的 JSON Schema（name + description + parameters）随每次请求发给 LLM。没有它，模型不知道有哪些工具可用，永远不会输出 tool_calls。',
  },
  ia05: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `# compile 时传 checkpointer → 持久化能力
return workflow.compile(checkpointer=self.checkpointer)

# stream 时用 astream_events → 流式能力
async for event in self.graph.astream_events(
    {"messages": messages}, config=config, version="v1"
):
    ...`,
    note: 'compile(checkpointer=...) 提供持久化，astream_events 提供 token 级流式。这些都是自己写 while 循环拿不到的能力——这就是 Runtime 的价值。',
  },

  // ===== LangGraph 框架 =====
  ia06: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `workflow = StateGraph(MessagesState)
# 不是 Chain 的 .pipe() 线性管道，而是真正的图：
# 支持条件边、循环（agent→tools→agent）、子图`,
    note: 'StateGraph 是显式的图——支持条件分支和循环，这让 ReAct 的「agent→tools→agent」循环成为可能。Chain 只能单向线性流，无法回头。',
  },
  ia07: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `# 三要素之一：模块级单例（不能每请求 new）
_FALLBACK_CHECKPOINTER = MemorySaver()

# 三要素之二：compile 时传 checkpointer
self.graph = workflow.compile(checkpointer=self.checkpointer)

# 三要素之三：调用时传 thread_id
config = {"configurable": {"thread_id": thread_id}}`,
    note: '跨请求记忆三个条件缺一不可：①checkpointer 实例复用（模块级/lifespan 单例）②compile 时传入 ③调用时传 thread_id。最常见的 bug 是每请求 new MemorySaver，新实例里没有历史。',
  },
  ia08: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `async for event in self.graph.astream_events(
    {"messages": messages}, config=config, version="v1"
):
    kind = event["event"]
    if kind == "on_chat_model_stream":   # 每个 token
        ...
    elif kind == "on_tool_start":        # 工具开始
        ...
    elif kind == "on_tool_end":          # 工具结束
        ...`,
    note: 'astream_events 给 token 级细粒度事件（on_chat_model_stream / on_tool_start / on_tool_end），前端实时渲染必须用它。astream 只给节点级粗粒度事件，做不到逐 token 流式。',
  },
  ia09: {
    file: 'apps/api/app/agents/multi/team.py',
    lang: 'python',
    code: `# Sequential：前一步输出是后一步输入
research = await self.workers["Researcher"].execute(f"Research: {topic}")
writer = await self.workers["Writer"].execute(f"Based on research:\\n{research}...")

# Parallel：各子任务独立，asyncio.gather 并发
results = await asyncio.gather(*[self.workers[n].execute(t) for n, t in tasks])`,
    note: '选模式看「子任务之间有无依赖」：有依赖→Sequential（研究→写作→审稿）；无依赖→Parallel（多角度并发分析）；需要动态分配→Supervisor。',
  },
  ia10: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `RECURSION_LIMIT = 25  # 最多执行 25 步节点就强制停止

config = {
    "configurable": {"thread_id": thread_id},
    "recursion_limit": RECURSION_LIMIT,  # 防 LLM 死循环
}`,
    note: 'recursion_limit 是 LangGraph 内置安全机制，超过步数强制结束。配合 max_tokens（限单次生成）+ timeout（限单次超时）形成三层预算控制。',
  },

  // ===== 工程落地 =====
  ia11: {
    file: 'apps/api/app/api/v1/chat.py',
    lang: 'python',
    code: `async for chunk in agent.stream(request.message):
    if chunk["type"] == "done":
        break
    # NDJSON：每行一个完整 JSON + \\n 分隔
    yield (json.dumps(chunk) + "\\n").encode("utf-8")`,
    note: 'NDJSON 每行一个 JSON，靠 \\n 分隔，比 SSE 的 event:/data: 前缀更简单。前端用 fetch + ReadableStream 按行解析，不依赖 EventSource API（在部分 WebView 环境不可靠）。',
  },
  ia12: {
    file: 'apps/api/app/mcp_servers/config.json',
    lang: 'json',
    code: `{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["-m", "app.mcp_servers.weather_server"],
      "transport": "stdio"
    }
  }
}`,
    note: 'MCP 让工具变成独立进程 + 标准协议，可被任何 MCP Host（Claude/Cursor）复用。加新工具只改 config.json，不动 agent 代码——这是 @tool 装饰器做不到的解耦。',
  },
  ia13: {
    file: 'apps/api/app/mcp_servers/loader.py',
    lang: 'python',
    code: `# MultiServerMCPClient 默认无状态模式：
# 每次工具调用新建 ClientSession，spawn 新 stdio 子进程跑完就退
# 我们缓存的是【LangChain Tool 包装对象】，不是子进程
_TOOLS_CACHE = await _CLIENT.get_tools()

# 需要长连接/共享上下文要显式：
# async with client.session("weather") as session:
#     tools = await load_mcp_tools(session)`,
    note: 'stdio MCP 子进程默认不常驻：每次调用 = spawn 新进程 → 执行 → 退出。这是最容易误解的点。需要长会话才用 client.session() 显式管理持久 Session。',
  },
  ia14: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `async def _agent_node(self, state):
    # LLM 调用是 I/O 等待（5-30s），await 让出执行权
    response = await self.llm_with_tools.ainvoke(state["messages"])
    return {"messages": [response]}`,
    note: 'LLM 调用是 I/O 密集型（等响应期间 CPU 空闲）。async/await 让单 worker 在等待时处理其他请求——同步模式下 1 worker 同时只能服务 1 个用户。',
  },
  ia15: {
    file: 'apps/api/app/mcp_servers/weather_server.py',
    lang: 'python',
    code: `@mcp.tool()
def get_weather(city: str) -> str:
    """查询指定城市的实时天气信息（气温、降水概率、风速）。
    适用于需要天气数据来给出行/洗车等建议的场景。
    返回：包含温度区间和降雨概率的天气摘要字符串。
    """
    ...`,
    note: '好的 description = what（做什么）+ when（何时用）+ output（返回什么）。参数说明放 inputSchema，不要堆在 description 里干扰模型对工具用途的判断。',
  },
  ieng01: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `self.llm_with_tools = self.llm.bind_tools(self.tools)
# 所有工具的 name + description + 参数 schema 随请求注入 LLM
# 模型根据「用户意图 ↔ 工具描述」做语义匹配，输出 tool_calls`,
    note: 'LLM 选工具靠的是语义匹配，不是 if-else 规则。bind_tools 把所有工具 schema 注入上下文，模型自己判断调哪个。这就是 description 质量直接影响准确率的原因。',
  },
  ieng02: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `workflow.add_conditional_edges("agent", tools_condition)
# 无 tool_calls → 走 END 分支 → 直接返回 LLM 文本
# 此时 Agent 退化为普通 Chatbot`,
    note: '没有工具匹配时，AIMessage 不含 tool_calls，tools_condition 直接走 END，返回 LLM 自身知识生成的回答。这等价于切到 M0 Basic Chatbot 模式。',
  },
  ieng03: {
    file: 'apps/api/app/mcp_servers/config.json',
    lang: 'json',
    code: `"dangerous": {
  "command": "python",
  "args": ["-m", "app.mcp_servers.dangerous_server"],
  "transport": "stdio",
  "_description": "危险工具（删除/转账）· HITL 演示 · destructive"
}`,
    note: '降低工具误调的多层手段：优化 description（写清 when）+ 减少工具数量 + system prompt 路由规则 + MCP annotations 标注风险 + 高危工具加 HITL 确认（dangerous_server 就是演示）。',
  },
  ieng04: {
    file: 'apps/api/app/agents/multi/team.py',
    lang: 'python',
    code: `async def execute_supervisor(self, topic: str):
    # Supervisor 先分解任务，路由到不同 Worker
    # 每个 Worker 只带自己领域的工具子集
    resp = await self.supervisor_llm.ainvoke([HumanMessage(content=prompt)])
    tasks = json.loads(...).get("tasks", [])
    for task in tasks:
        assignee = task.get("assignee")
        output = await self.workers[assignee].execute(task.get("task"))`,
    note: '工具太多（50+）会挤占上下文、降低选择准确率。解法是分层路由：Supervisor 先判断领域，再只加载对应 Worker 的工具子集（类似 MCP toolsFilter）。',
  },

  // ===== RAG / 评测 / 调试 / 成本 =====
  ieng05: {
    file: 'apps/api/app/core/rag.py',
    lang: 'python',
    code: `# 离线（索引建设）：Chunking → Embedding → Store
chunks = _split_documents(docs)        # 切块
vectorstore = Chroma.from_documents(   # 向量化 + 存储
    documents=chunks,
    embedding=_get_embedding_function(),
    persist_directory=persist_dir,
)

# 在线（每次查询）：Query → Inject → Generate
docs = await retriever.ainvoke(message)   # 检索
context = format_rag_context(docs)        # 注入上下文`,
    note: 'RAG 6 步：切块→向量化→存储（离线建索引）+ 检索→注入→生成（在线查询）。项目里 rag.py 实现了完整流程，用本地免费 embedding 模型，不依赖 OpenAI embedding API。',
  },
  ieng06: {
    file: 'apps/api/app/core/rag.py',
    lang: 'python',
    code: `# 当前：单阶段向量检索（粗召回）
_RETRIEVER = vectorstore.as_retriever(search_kwargs={"k": top_k})

# 生产增强方向：二阶段检索
# 1. 向量检索召回 top-20（快但粗）
# 2. cross-encoder Reranker 精排取 top-5（慢但准）`,
    note: '检索内容不相关时加 Reranker：先向量检索粗召回 top-20，再用 cross-encoder 精排取 top-5。二阶段「先广后精」是 RAG 生产标配。',
  },
  ieng07: {
    file: 'apps/api/app/core/rag.py',
    lang: 'python',
    code: `def format_rag_context(docs: list) -> str:
    parts = ["--- 以下是从知识库检索到的相关内容 ---"]
    for i, doc in enumerate(docs, 1):
        source = Path(doc.metadata.get("source", "未知")).name
        parts.append(f"\\n[{i}] 来源: {source}\\n{doc.page_content[:500]}")
    parts.append("\\n--- 请基于以上内容回答，并标注引用编号 [1][2] ---")
    return "\\n".join(parts)`,
    note: '引用标注：注入时带上来源元信息（文档名 + 编号）+ system prompt 要求标注 [1][2]。让用户能验证回答真实性，这是 RAG 比纯 LLM 可信的关键。',
  },
  ieng08: {
    file: 'apps/api/eval/run_eval.py',
    lang: 'python',
    code: `def check_assertions(result, assertions):
    # 不只看最终回答，还看执行轨迹：
    if "must_call_tool" in assertions:      # 该调的工具调了没
        ...
    if assertions.get("must_not_call_tool"): # 有没有多余调用
        ...
    if "must_contain" in assertions:         # 回答是否基于工具结果
        ...`,
    note: 'Trajectory Evaluation 评估整个执行轨迹：该调工具时调了没、参数对不对、有无多余调用、回答是否基于工具结果而非幻觉。run_eval.py 的断言系统就是简化版轨迹评测。',
  },
  ieng09: {
    file: 'apps/api/app/api/v1/chat.py',
    lang: 'python',
    code: `# NDJSON 流里的 tool_calls / tool_result 事件 = 简化版 trace
yield {"type": "tool_calls", "data": {"name": ..., "input": ...}}
yield {"type": "tool_result", "data": {"name": ..., "output": ...}}`,
    note: '排查 Agent 错误靠 trace：定位完整执行树（LLM 输入/输出 → 工具调用 → 工具返回 → 最终生成），看是工具返错数据、LLM 没用工具结果、还是模型幻觉。项目的 NDJSON 事件流就是最简版 trace。',
  },
  ieng10: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `sys = SystemMessage(content=(
    "你是一个可调用工具的中文助手。遇到天气/出行/洗车等问题，"
    "必须先调用 get_weather(city) 获取数据后再给结论。"  # ← 防工具结果幻觉
    "回答时先给结论，再给依据，最后附天气摘要。"
))`,
    note: '「工具结果幻觉」= 工具给了正确数据但 LLM 自己编答案。防御：①system prompt 强调「必须基于工具返回的数据」②结构化输出约束 ③评测断言「回答必须含工具返回的关键数据」。',
  },
  ieng11: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `MAX_TOKENS = 4096          # 限单次生成
RECURSION_LIMIT = 25       # 限循环步数
REQUEST_TIMEOUT = 60       # 限单次超时

self.llm = ChatOpenAI(
    max_tokens=MAX_TOKENS,
    request_timeout=REQUEST_TIMEOUT,
)`,
    note: '成本控制是多层的：max_tokens（生成上限）+ recursion_limit（循环上限）+ 模型分级 + 上下文压缩 + Prompt Caching。Agent 成本 = 轮数 × 每轮 token，控制任一维度都有效。',
  },
  ieng12: {
    file: 'apps/api/app/api/v1/chat.py',
    lang: 'python',
    code: `# 流式：第一个 token 毫秒级出现，工具调用过程实时推送
async for chunk in agent.stream(request.message):
    yield (json.dumps(chunk) + "\\n").encode("utf-8")
# 总延迟没变，但用户感知等待从 10s 降到 0.5s`,
    note: '流式 + 过程可见是 Agent UX 核心。总延迟可能不变，但用户感知的等待从 10 秒降到 0.5 秒。工具调用中间状态（tool_calls/tool_result）实时推送让用户知道「Agent 在干活」。',
  },

  // ===== 高级：上下文工程 / Harness =====
  iadv01: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `# 最简版上下文工程：分层组织送给 LLM 的信息
sys = SystemMessage(content="...")        # 指令层
messages = [sys, HumanMessage(content=message)]  # + 用户输入
# 完整版还会加：RAG 检索结果、工具返回、历史摘要、长期记忆`,
    note: 'Context Engineering 是系统级设计——控制什么信息、以什么格式、在什么时机进入 LLM 上下文。Prompt Engineering 只是「写一条好提示词」，是其中一环。',
  },
  iadv02: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `# 项目已实现的上下文组成：
SystemMessage(content="...")   # ① 系统指令
HumanMessage(content=message)  # ② 用户输入
StateGraph(MessagesState)      # ③ 短期记忆（对话窗口）
ToolNode(self.tools)           # ⑥ 工具调用结果
# RAG（⑤）和长期记忆（④）见 rag.py / 规划中`,
    note: 'Agent 上下文 7 要素：系统指令 + 用户输入 + 短期记忆 + 长期记忆 + RAG + 工具结果 + 结构化输出。项目已实现指令层、短期记忆、工具结果，RAG 在 rag.py。',
  },
  iadv03: {
    file: 'apps/api/app/core/context_compressor.py',
    lang: 'python',
    code: `WINDOW_SIZE = 20    # 保留最近 20 条（滑动窗口）
MAX_MESSAGES = 30   # 超过触发压缩

async def compress_messages(messages, llm=None):
    if len(messages) <= MAX_MESSAGES:
        return messages
    old_messages = non_system[:-WINDOW_SIZE]       # 旧消息
    recent_messages = non_system[-WINDOW_SIZE:]    # 保留近期
    summary = await _generate_summary(old_messages, llm)  # 旧的生成摘要
    return system_msgs + [SystemMessage(f"[摘要] {summary}")] + recent_messages`,
    note: '对话太长的多策略组合：滑动窗口（保留最近 N 轮）+ 摘要压缩（旧对话用 LLM 生成摘要）+ token 预算控制。context_compressor.py 实现了窗口+摘要的三层记忆模型。',
  },
  iadv04: {
    file: 'apps/api/app/mcp_servers/weather_server.py',
    lang: 'python',
    code: `@mcp.tool()
def get_weather(city: str) -> str:
    """查询指定城市的实时天气（气温、降水概率、风速）。
    适用于需要天气数据给出行建议的场景。返回天气摘要字符串。
    """  # ← 这段 docstring 会被 bind_tools 注入 LLM 上下文`,
    note: 'description 是 LLM 上下文的一部分——模型通过它判断「何时调用、参数怎么填」。写得差 = 选错工具或填错参数。这是上下文工程在工具层的体现。',
  },

  // ===== 真实踩坑 =====
  ibug01: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `# ❌ Bug：每请求 new MemorySaver → 新实例没有历史 → 多轮对话续不上
# ✅ 修复：模块级单例 + lifespan 注入持久化 checkpointer
_FALLBACK_CHECKPOINTER = MemorySaver()  # 模块级，所有实例共享

# main.py lifespan 里注入持久化版本
async with create_checkpointer() as checkpointer:
    app.state.checkpointer = checkpointer`,
    note: 'STAR：S-多轮对话续不上；T-定位原因；A-发现 checkpointer 生命周期和请求绑定了；R-提到模块级单例/lifespan 后问题消失。教训：有状态组件必须是进程级单例。',
  },
  ibug02: {
    file: 'apps/api/app/mcp_servers/loader.py',
    lang: 'python',
    code: `# ❌ 误解：以为 stdio server 启动后常驻，并发时偶现连接失败
# ✅ 真相：MultiServerMCPClient 默认无状态，每次调用 spawn 新进程
# 缓存的是 Tool 包装对象（不是进程）
_TOOLS_CACHE = await _CLIENT.get_tools()`,
    note: 'STAR：以为 stdio server 常驻 → 并发测试偶报连接错误 → 读 langchain-mcp-adapters 源码发现是无状态模式 → 改为缓存 Tool 对象解决。承认「一开始误解」反而加分：说明你会读源码排查。',
  },
  ibug03: {
    file: 'apps/api/app/api/v1/chat.py',
    lang: 'python',
    code: `# ❌ Bug：忘了加 \\n，前端 buffer.indexOf("\\n") 永远返回 -1
#        所有数据粘成一坨直到流结束才出现
# ✅ 修复：每个 JSON 后加 \\n 分隔符
yield (json.dumps(chunk) + "\\n").encode("utf-8")`,
    note: 'NDJSON 的分隔完全靠 \\n。排查路径：确认后端在 yield（加日志）→ 看前端 buffer（一直增长没切分）→ 定位缺 \\n → 一行修复。教训：流式协议的分隔符就是生命线。',
  },
  ibug04: {
    file: 'apps/api/app/agents/single/agent.py',
    lang: 'python',
    code: `# 三层预算防线，任何一层触发就强制停止
RECURSION_LIMIT = 25       # 防 LLM 死循环
MAX_TOKENS = 4096          # 防单次超长生成
REQUEST_TIMEOUT = 60       # 防单次 API 卡死

config = {"recursion_limit": RECURSION_LIMIT}
self.llm = ChatOpenAI(max_tokens=MAX_TOKENS, request_timeout=REQUEST_TIMEOUT)`,
    note: '真实场景：用户说「一直搜索直到找到完美答案」→ Agent 无限循环烧钱。三层防线：recursion_limit 防循环、max_tokens 防超长、timeout 防卡死，缺一不可。',
  },
  ibug05: {
    file: 'apps/api/app/core/auth.py',
    lang: 'python',
    code: `class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        user_context = self._resolve_user(request)
        cv_token = _current_user.set(user_context)  # ContextVar 协程隔离
        try:
            return await call_next(request)
        finally:
            _current_user.reset(cv_token)  # finally reset 防泄漏

# AUTH_SECRET 空=放行（开发友好），有值=必须带 Bearer Token`,
    note: '设计：开发时不操心鉴权（AUTH_SECRET 空=放行），上线设值就启用。中间件不直接 401（/health 要过），由 get_current_user() 决定。ContextVar + finally reset 防并发时用户身份互相覆盖。',
  },
};

export function getCodeSnippet(questionId) {
  return CODE_SNIPPETS[questionId] || null;
}
