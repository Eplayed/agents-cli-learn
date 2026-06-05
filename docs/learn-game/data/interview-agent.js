// 面试题库：Agent 核心（15 题）
// 来源参考：adongwanai/AgentGuide + guocong-bincai/ai-interview-guide + didilili/ai-agents-from-zero
// 每题附带：interviewTip（面试加分话术）+ projectMapping（对应项目代码）+ difficulty（⭐/⭐⭐/⭐⭐⭐）

export default {
  id: 'INT-AGENT',
  topic: '面试 · Agent 核心',
  title: 'AI Agent 工程师高频面试题',
  subtitle: '15 道最常考的 Agent 原理 + 工程落地题，每题对应你项目的真实代码',

  stages: [
    {
      kind: 'story',
      title: '面试官到底在考什么？',
      content: `
        <p>Agent 岗位面试通常分 <strong>5 轮</strong>：</p>
        <ol>
          <li><strong>基础概念</strong>：Agent 定义、ReAct、Tool Calling 协议</li>
          <li><strong>框架深度</strong>：LangGraph / OpenAI SDK 的图结构、状态管理</li>
          <li><strong>工程落地</strong>：流式协议、异步并发、工具治理、鉴权</li>
          <li><strong>系统设计</strong>：高可用 Agent 服务架构</li>
          <li><strong>代码现场</strong>：手写一个 Agent 循环 / MCP Server</li>
        </ol>

        <div class="story-box">
          🎯 <strong>本关 15 道题覆盖前 3 轮</strong>，每题给你：
          <ul>
            <li>📚 正确答案 + 详细解释</li>
            <li>💡 面试加分话术（interviewTip）</li>
            <li>🔗 对应你项目的哪行代码（projectMapping）</li>
            <li>⭐ 难度标注</li>
          </ul>
        </div>

        <div class="callout">
          💡 <strong>面试核心原则</strong>：不要背定义，要<strong>讲你怎么用的</strong>。
          "我项目里是这样实现的…" 比 "论文里说…" 有说服力 10 倍。
        </div>
      `,
    },

    {
      kind: 'final-quiz',
      title: '模拟面试：Agent 核心 15 题',
      passLine: 0.6,
      questions: [
        // ===== 基础概念（5 题）=====
        {
          id: 'ia01',
          type: 'single',
          knowledgeTag: 'Agent 定义',
          difficulty: '⭐',
          text: '面试官问：<strong>"用一句话定义 AI Agent，和 Chatbot 的本质区别是什么？"</strong>',
          options: [
            { text: 'Agent 用更大的模型，Chatbot 用更小的模型', value: 'a' },
            { text: 'Agent 能感知环境、自主决策、调用工具改变外部状态并多轮循环，Chatbot 只做单轮文本生成', value: 'b' },
            { text: 'Agent 必须联网，Chatbot 不需要', value: 'c' },
            { text: 'Agent 是多模态的，Chatbot 只能处理文本', value: 'd' }
          ],
          answer: 'b',
          explain: 'Agent 三要素：感知（输入）+ 决策（LLM 推理）+ 行动（工具调用 / 副作用）。区别在于"能否对外部世界产生副作用"和"是否多轮自主推进"。',
          deeper: '面试加分：提到"ReAct 论文"和"OpenAI Function Calling 是 ReAct 的工程化实现"会让面试官眼前一亮。',
          interviewTip: '回答时先给定义，再举你项目的例子："比如我项目里用户问天气，Agent 会先决定调 get_weather 工具，拿到真实数据后再生成回答——这就是 Chatbot 做不到的。"',
          projectMapping: 'apps/api/app/agents/single/agent.py — 整个 _build_graph 就是 Agent 循环的实现',
        },
        {
          id: 'ia02',
          type: 'order',
          knowledgeTag: 'ReAct',
          difficulty: '⭐',
          text: '面试官问：<strong>"描述一下 ReAct 范式的执行顺序"</strong>',
          items: [
            { id: 'think', text: 'Thought：LLM 基于当前上下文推理，决定下一步行动' },
            { id: 'act', text: 'Action：选择一个工具并构造参数调用' },
            { id: 'observe', text: 'Observation：接收工具返回的结果' },
            { id: 'loop', text: '循环判断：任务是否完成？未完成则回到 Thought' },
          ],
          answer: ['think', 'act', 'observe', 'loop'],
          explain: 'ReAct（Reasoning + Acting）2022 年由 Yao et al. 提出。核心是让 LLM 交替进行"推理"和"行动"，而不是一次性生成全部答案。',
          deeper: '面试加分：能说出"和 Chain-of-Thought 的区别是 CoT 只推理不行动，ReAct 加了工具调用形成闭环"。',
          interviewTip: '画一个简单流程图，然后说"我项目里 LangGraph 的 agent→tools→agent 循环就是 ReAct 的工程化落地"。',
          projectMapping: 'agent.py::_build_graph — workflow.add_conditional_edges("agent", tools_condition) 就是 ReAct 的"循环判断"',
        },
        {
          id: 'ia03',
          type: 'single',
          knowledgeTag: 'Function Calling',
          difficulty: '⭐',
          text: '面试官问：<strong>"OpenAI 的 Function Calling / Tool Use 本质上做了什么？"</strong>',
          options: [
            { text: '让模型直接执行 Python 代码', value: 'a' },
            { text: '让模型在输出里生成结构化的 tool_calls（工具名 + 参数 JSON），由应用层执行实际调用', value: 'b' },
            { text: '让模型自动连接数据库', value: 'c' },
            { text: '让模型调用 OpenAI 内部的工具', value: 'd' }
          ],
          answer: 'b',
          explain: 'Function Calling 不是"模型执行工具"，而是"模型输出调用意图"。实际执行由你的代码完成。模型只负责"决定调什么、传什么参数"。',
          deeper: '面试加分：强调"模型和执行是解耦的"——这就是为什么你可以在工具执行前加 HITL 审批。',
          interviewTip: '说："在我项目里，LLM 输出 tool_calls，LangGraph 的 ToolNode 负责执行，两者通过 AIMessage.tool_calls 字段通信。"',
          projectMapping: 'agent.py::_agent_node — llm_with_tools.ainvoke(messages) 产出的 AIMessage 可能含 tool_calls',
        },
        {
          id: 'ia04',
          type: 'single',
          knowledgeTag: 'bind_tools',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"如果不调 bind_tools，Agent 还能调用工具吗？为什么？"</strong>',
          options: [
            { text: '能，工具会自动注册', value: 'a' },
            { text: '不能。bind_tools 把工具的 JSON Schema 注入 LLM 上下文，没有它模型不知道有什么工具可用，永远不会输出 tool_calls', value: 'b' },
            { text: '能，但会随机调用', value: 'c' },
            { text: '会报运行时错误', value: 'd' }
          ],
          answer: 'b',
          explain: 'bind_tools 的本质是在每次 LLM 请求时把工具的 schema（name + description + parameters）作为 tools 参数发给 API。LLM 看到 schema 才知道"我可以输出 tool_calls"。',
          deeper: '面试加分：能说出"schema 里的 description 质量直接影响模型调用准确率"——这也是 MCP 协议强调 docstring 的原因。',
          interviewTip: '从代码角度讲："我项目里这一行 self.llm_with_tools = self.llm.bind_tools(self.tools) 是 ReAct 能成立的前提。"',
          projectMapping: 'agent.py — self.llm_with_tools = self.llm.bind_tools(self.tools)',
        },
        {
          id: 'ia05',
          type: 'multi',
          knowledgeTag: 'Agent Runtime',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"为什么生产 Agent 要用 LangGraph 这样的 Runtime，不能自己写 while 循环？"</strong>（多选）',
          options: [
            { text: '需要持久化对话状态（Checkpoint），重启后能恢复', value: 'a' },
            { text: '需要流式输出每个 token 和工具调用事件给前端', value: 'b' },
            { text: '需要在危险操作前暂停等人工确认（HITL）', value: 'c' },
            { text: 'while 循环跑不了 Python', value: 'd' },
            { text: '需要对每一步做可观测追踪（trace/span）', value: 'e' },
            { text: '需要防止 LLM 死循环烧钱（recursion_limit）', value: 'f' }
          ],
          answer: ['a', 'b', 'c', 'e', 'f'],
          explain: '自己写 while 循环能跑起来，但缺少：持久化、流式、HITL、可观测、预算控制。这些都是生产必须的，也是 Agent Runtime 的核心价值。',
          deeper: '面试加分：能列出 5 个以上能力说明你理解"Runtime 不是多余的抽象层"。',
          interviewTip: '建议用对比法回答："while 循环能实现基本逻辑，但生产需要 5 个额外能力…（逐个列举）…这就是 LangGraph 的价值。"',
          projectMapping: 'agent.py::_build_graph — compile(checkpointer=...) 给了 checkpoint；astream_events 给了流式',
        },

        // ===== 框架深度（5 题）=====
        {
          id: 'ia06',
          type: 'single',
          knowledgeTag: 'StateGraph',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"LangGraph 的 StateGraph 和 LangChain 的 Chain 有什么本质区别？"</strong>',
          options: [
            { text: 'StateGraph 更快', value: 'a' },
            { text: 'StateGraph 是显式的图（可视化/可调试/支持循环和条件分支），Chain 是隐式的线性管道（只能单向流）', value: 'b' },
            { text: 'Chain 支持工具调用，StateGraph 不支持', value: 'c' },
            { text: '没区别，只是名字不同', value: 'd' }
          ],
          answer: 'b',
          explain: 'Chain 是 A→B→C 的管道，不能循环回去。StateGraph 是真正的图：支持条件边、支持循环（agent→tools→agent）、支持子图。这让 ReAct 循环成为可能。',
          deeper: '面试加分：提到"2025 年后 LangChain 官方已经弃用 Chain 范式，推荐用 LangGraph 的显式图"。',
          interviewTip: '说一句有见地的话："显式图的最大好处是可调试性——我可以 print(graph) 看结构，可以单独测某个节点。"',
          projectMapping: 'agent.py::_build_graph — StateGraph(MessagesState) 创建图，而不是 Chain 的 .pipe()',
        },
        {
          id: 'ia07',
          type: 'single',
          knowledgeTag: 'Checkpoint',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"LangGraph 的 Checkpoint 怎么实现跨请求的对话记忆？三个条件是什么？"</strong>',
          options: [
            { text: '只要传 thread_id 就行', value: 'a' },
            { text: '三个条件：①编译图时传 checkpointer ②调用时传 configurable.thread_id ③checkpointer 实例跨请求复用（不能每请求 new）', value: 'b' },
            { text: '需要自己写 DB 保存消息', value: 'c' },
            { text: '用 Redis 缓存 messages', value: 'd' }
          ],
          answer: 'b',
          explain: '三缺一都不行。最容易犯的错是"每请求 new MemorySaver"——新实例里是空的，thread_id 匹配不到任何历史。',
          deeper: '面试加分：讲你项目里"之前的 bug"——每请求 new MemorySaver 导致多轮对话失效，修复方案是提到模块级单例。',
          interviewTip: '用真实 bug 案例回答效果最好："我之前踩过这个坑——每请求新建 MemorySaver，导致第二轮对话拿不到历史。修了之后用模块级单例共享。"',
          projectMapping: 'agent.py — _GLOBAL_CHECKPOINTER = MemorySaver() 在模块级创建，所有 SingleAgent 实例共享',
        },
        {
          id: 'ia08',
          type: 'single',
          knowledgeTag: 'astream_events',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"astream_events 和 astream 有什么区别？你用哪个？为什么？"</strong>',
          options: [
            { text: '没区别', value: 'a' },
            { text: 'astream 给节点级事件（粗粒度），astream_events 给 LLM token 级事件（细粒度）；驱动前端 UI 必须用后者', value: 'b' },
            { text: 'astream 是异步的，astream_events 是同步的', value: 'c' },
            { text: 'astream_events 只支持 OpenAI', value: 'd' }
          ],
          answer: 'b',
          explain: 'astream 每个节点输出一次（只知道"agent 节点执行完了"）。astream_events 能拿到 on_chat_model_stream（每个 token）、on_tool_start/end（工具开始/结束）。前端流式渲染必须用后者。',
          deeper: '面试加分：能说出 version="v1" 参数的含义——"事件格式版本，v1 是稳定版"。',
          interviewTip: '直接说场景："我项目前端要实时显示每个 token 和工具调用状态，所以用 astream_events，事件类型包括 on_chat_model_stream / on_tool_start / on_tool_end。"',
          projectMapping: 'agent.py::stream — self.graph.astream_events({"messages": messages}, config=config, version="v1")',
        },
        {
          id: 'ia09',
          type: 'single',
          knowledgeTag: 'Multi-Agent',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"Multi-Agent 的 Sequential / Parallel / Supervisor 三种模式分别适合什么场景？"</strong>',
          options: [
            { text: 'Sequential 适合所有场景', value: 'a' },
            { text: 'Sequential：前一步输出是后一步输入（如 研究→写作→审稿）；Parallel：各子任务独立无依赖（如多角度分析）；Supervisor：需要动态分配任务、路由到不同 worker', value: 'b' },
            { text: '只有 Supervisor 能用于生产', value: 'c' },
            { text: '三种没区别，只是命名不同', value: 'd' }
          ],
          answer: 'b',
          explain: '选模式的关键看"子任务之间有没有依赖"。有依赖 → Sequential；无依赖 → Parallel；需要动态路由 → Supervisor。',
          deeper: '面试加分：能补充"GroupChat 适合需要多角色讨论/头脑风暴的场景"和"LangGraph 的 Send API 能实现更灵活的并行"。',
          interviewTip: '举你项目的例子："我项目里 Sequential 用于 研究员→作家→审稿人 的内容生产流水线，Parallel 用于多角度分析同一个话题。"',
          projectMapping: 'apps/api/app/agents/multi/team.py — execute_sequential / execute_parallel / execute_supervisor',
        },
        {
          id: 'ia10',
          type: 'single',
          knowledgeTag: 'recursion_limit',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"如果 LLM 一直输出 tool_calls 不停循环，怎么防止烧钱？"</strong>',
          options: [
            { text: '靠 LLM 自己判断什么时候停', value: 'a' },
            { text: '设置 recursion_limit（最大步数），超过时 LangGraph 强制结束并返回当前状态', value: 'b' },
            { text: '设置 temperature=0 就不会循环', value: 'c' },
            { text: '每次只允许调用一个工具', value: 'd' }
          ],
          answer: 'b',
          explain: 'recursion_limit 是 LangGraph 的内置安全机制。graph.invoke(input, config={"recursion_limit": 25}) 表示最多执行 25 步节点就强制停止。',
          deeper: '面试加分：补充"还可以加 max_tokens 限制单次 LLM 生成长度 + timeout 限制单次调用超时"形成多层预算控制。',
          interviewTip: '展示你的"工程敏感度"："我项目里目前 M5 阶段要做三层预算控制：recursion_limit 防死循环、max_tokens 防超长生成、timeout 防单次卡死。"',
          projectMapping: 'M5 待实现 — config={"recursion_limit": 25}（在 agent.py 的 astream_events 调用时传入）',
        },

        // ===== 工程落地（5 题）=====
        {
          id: 'ia11',
          type: 'single',
          knowledgeTag: 'NDJSON',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"你的 Agent 流式输出用的什么协议？为什么不用 SSE？"</strong>',
          options: [
            { text: '用 WebSocket，因为它支持双向通信', value: 'a' },
            { text: '用 NDJSON（每行一个 JSON），因为 SSE 的 EventSource 不支持 POST、不支持自定义 header，在 Electron 等环境兼容差', value: 'b' },
            { text: '用 SSE，因为它是标准', value: 'c' },
            { text: '用 gRPC streaming', value: 'd' }
          ],
          answer: 'b',
          explain: 'NDJSON 用纯 fetch + ReadableStream 实现，支持 POST + 自定义 header（鉴权），跨环境兼容性最好。SSE 虽然是标准，但 EventSource API 限制太多。',
          deeper: '面试加分：能说出"Vercel AI SDK 也用类似方案"和"OpenAI Responses API 的流式也是类 NDJSON"。',
          interviewTip: '先说选型，再说实现："我用 NDJSON，后端 StreamingResponse yield 每行 JSON+\\n，前端 fetch + ReadableStream 按行切分解析。"',
          projectMapping: 'apps/api/app/api/v1/chat.py::chat_stream_ndjson — yield (json.dumps(chunk) + "\\n").encode("utf-8")',
        },
        {
          id: 'ia12',
          type: 'single',
          knowledgeTag: 'MCP',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"MCP 协议的核心价值是什么？和直接用 @tool 装饰器有什么区别？"</strong>',
          options: [
            { text: 'MCP 比 @tool 快', value: 'a' },
            { text: 'MCP 让工具变成独立进程 + 标准协议：可被任何 MCP Host 复用（Claude/Cursor/Codex），支持独立部署、权限分级、审计', value: 'b' },
            { text: '@tool 不支持参数', value: 'c' },
            { text: 'MCP 只能用 Python', value: 'd' }
          ],
          answer: 'b',
          explain: '@tool 绑死在你的 agent 进程里，只有你的代码能调。MCP 是"工具的 USB-C"——标准化后任何 Host 都能发现并调用。',
          deeper: '面试加分：能说出"加新工具只需改配置文件，不需要改 agent 代码"这个配置化加载的工程价值。',
          interviewTip: '用类比："MCP 之于 LLM 工具，相当于 LSP 之于 IDE 语言支持——标准化连接，一份实现全生态复用。"',
          projectMapping: 'apps/api/app/mcp_servers/ — weather_server.py 是独立 MCP server，config.json 配置化加载',
        },
        {
          id: 'ia13',
          type: 'single',
          knowledgeTag: 'MCP stdio',
          difficulty: '⭐⭐⭐',
          text: '面试官问：<strong>"MCP 的 stdio transport 下，子进程是常驻的吗？"</strong>',
          options: [
            { text: '是，启动一次后所有请求复用', value: 'a' },
            { text: '不是。MultiServerMCPClient 默认无状态模式：每次工具调用新建 ClientSession，子进程跑完就退出。要常驻需显式 async with client.session(name)', value: 'b' },
            { text: '看配置，默认常驻', value: 'c' },
            { text: 'stdio 不支持 Python', value: 'd' }
          ],
          answer: 'b',
          explain: '这是 MCP 最容易记错的点。默认行为：每次调用 = spawn 新进程 → 执行 → 退出。大部分工具（查天气、算加法）这样就够了。',
          deeper: '面试加分：补充"需要长会话的场景（如数据库事务、流式文件读取）才需要显式 session 管理"。',
          interviewTip: '承认这是"容易犯的错"更显真实："这个点我一开始也理解错了，后来看了 langchain-mcp-adapters 源码才明白默认是无状态的。"',
          projectMapping: 'apps/api/app/mcp_servers/loader.py — get_mcp_tools() 的 docstring 详细解释了无状态语义',
        },
        {
          id: 'ia14',
          type: 'single',
          knowledgeTag: '异步并发',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"为什么 Agent 服务的 LLM 调用必须用 async/await？"</strong>',
          options: [
            { text: '因为 OpenAI SDK 只有异步版本', value: 'a' },
            { text: 'LLM 调用是 I/O 等待（5-30 秒），同步会让一个 worker 被占满无法处理其他请求；async 让单 worker 同时处理上千个等待中的请求', value: 'b' },
            { text: 'async 比 sync 快 10 倍', value: 'c' },
            { text: 'FastAPI 强制要求', value: 'd' }
          ],
          answer: 'b',
          explain: '关键词是"I/O 密集"。等 LLM 响应期间 CPU 空闲，async 让出执行权给其他请求。同步 = 1 worker 同时只能服务 1 个用户。',
          deeper: '面试加分：能说出"这就是为什么 OpenAI / Anthropic 都重点推 async SDK（ainvoke / astream）"。',
          interviewTip: '用数字量化："假设 LLM 平均响应 10 秒，同步情况下 1 个 worker 1 分钟只能处理 6 个请求；async 下同一个 worker 可以并发处理 100+ 个。"',
          projectMapping: 'agent.py::_agent_node — await self.llm_with_tools.ainvoke(state["messages"])',
        },
        {
          id: 'ia15',
          type: 'multi',
          knowledgeTag: 'tool description',
          difficulty: '⭐⭐',
          text: '面试官问：<strong>"MCP 工具的 description 怎么写才能提高 LLM 调用准确率？"</strong>（多选）',
          options: [
            { text: '说明目的（what）：一句话说清楚工具做什么', value: 'a' },
            { text: '说明场景（when）：什么情况下该用这个工具', value: 'b' },
            { text: '说明输出（output）：返回什么格式/类型的数据', value: 'c' },
            { text: '把所有参数说明都堆在 description 里', value: 'd' },
            { text: '参数描述放在 inputSchema 的 description 里，不堆到工具 description', value: 'e' }
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: '好的 description = what + when + output。参数描述应该放 inputSchema（结构化），不要堆在 description 里（会干扰模型对工具用途的理解）。',
          deeper: '面试加分：提到"ToolHive 的最佳实践"和"MCP 规范里 annotations 四字段对 UX 的影响"。',
          interviewTip: '举例对比：不推荐"查询天气"（太短）；推荐"查询指定城市的实时天气信息（气温、降水、风速），适用于需要天气数据来给建议的场景，返回天气摘要字符串。"',
          projectMapping: 'apps/api/app/mcp_servers/weather_server.py — get_weather 函数的 docstring 就是 MCP 的 description',
        },
      ]
    }
  ]
};
