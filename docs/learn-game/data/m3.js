// M3 — LangGraph 核心：StateGraph 怎么把 Agent 抽象成状态机

export default {
  id: 'M3',
  topic: 'LangGraph Runtime',
  title: 'LangGraph：Agent 的"状态机"心脏',
  subtitle: 'StateGraph / ToolNode / bind_tools / Checkpoint / 流事件',

  stages: [
    // ============ Stage 1: 故事 ============
    {
      kind: 'story',
      title: '为什么把 Agent 画成"图"？',
      content: `
        <p>M0 我们说过：纯 ReAct 循环 30 行就能写出来。但生产场景一加，你的 while 循环立刻变成噩梦：</p>

        <pre data-lang="python"><code># 真实业务里你会写出这种代码：
while True:
    response = llm.invoke(messages)
    messages.append(response)

    # 危险工具要人工确认 → 怎么暂停 / 恢复？
    if any(c.name in DANGEROUS for c in response.tool_calls):
        approval = wait_for_human_approval()  # 这一行怎么实现？
        if not approval: break

    # 上下文太长 → 怎么修剪？
    if total_tokens(messages) > 100_000:
        messages = summarize(messages)  # 修剪逻辑放哪？

    # 用户中断后能恢复 → 怎么持久化 messages？
    save_to_db(messages)  # 每步都存？什么时候恢复？

    # 流式 token → 怎么往前端推？
    # ... 还要 try/except 每个工具调用 ...
    if not response.tool_calls:
        break
</code></pre>

        <p>5 个需求一加，代码就变成<strong>难以维护、难以测试、难以可视化</strong>的怪物。</p>

        <p>LangGraph 的解决方案：<strong>把 Agent 画成"状态机图"</strong>。</p>

        <ul>
          <li>每个"步骤" = 一个节点</li>
          <li>"流向" = 边（可以是条件边）</li>
          <li>"对话状态" = 在节点之间传递的 state 对象</li>
        </ul>

        <p>显式的图带来 4 个免费能力：</p>
        <ol>
          <li><strong>Checkpoint</strong>：每个节点执行后自动存 state，崩了能恢复</li>
          <li><strong>流式</strong>：astream_events 自动产出每个节点的细粒度事件</li>
          <li><strong>HITL</strong>：interrupt() 一行让任意节点暂停等审批</li>
          <li><strong>可观测</strong>：图结构本身就是最好的 trace</li>
        </ol>

        <div class="story-box">
          🎯 <strong>本关你将掌握 LangGraph 的 5 个核心：</strong>
          <ul>
            <li>StateGraph + Node + Edge 怎么组合</li>
            <li>bind_tools：让 LLM 知道有什么工具</li>
            <li>ToolNode + tools_condition 实现 ReAct 循环</li>
            <li>Checkpointer + thread_id 让对话能续</li>
            <li>astream_events 监听细粒度事件</li>
          </ul>
        </div>
      `,
    },

    // ============ Stage 2: 概念 - StateGraph ============
    {
      kind: 'concept',
      title: 'StateGraph：把 Agent 画出来',
      content: `
        <h3>📌 三个核心概念</h3>

        <table class="compare-table">
          <thead><tr><th>概念</th><th>是什么</th><th>类比</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>State</strong></td>
              <td>在节点间传递的数据，本项目用内置 MessagesState（含 messages 列表）</td>
              <td>函数的"参数 + 局部变量"</td>
            </tr>
            <tr>
              <td><strong>Node</strong></td>
              <td>能改 state 的函数。返回的 dict 会 merge 到 state</td>
              <td>函数</td>
            </tr>
            <tr>
              <td><strong>Edge</strong></td>
              <td>控制流向。可以是固定边，也可以是条件边（函数决定走哪条）</td>
              <td>if/else</td>
            </tr>
          </tbody>
        </table>

        <h3>📌 ReAct 循环画成图</h3>

        <pre>           ┌─────┐
START ───→ │agent│ ←─────────┐
           └──┬──┘            │
              │ tools_condition
              ↓               │
         ┌─有 tool_calls? ─┐  │
         │                 │  │
        yes               no  │
         │                 │  │
         ↓                 ↓  │
      ┌─────┐            END  │
      │tools│                 │
      └──┬──┘                 │
         └────────────────────┘</pre>

        <p>翻译成中文：</p>
        <ol>
          <li>从 START 开始，进 agent 节点（调 LLM）</li>
          <li>tools_condition 检查 LLM 输出有没有 tool_calls
            <ul>
              <li>有 → 走 tools 节点（执行工具），然后回到 agent</li>
              <li>没有 → 走 END，流程结束</li>
            </ul>
          </li>
        </ol>

        <h3>📌 vs 隐式的 chain</h3>

        <p>LangChain 早期的 chain 是隐式的（一串 .pipe 调用）。
        LangGraph 是显式的图。这有什么区别？</p>

        <ul>
          <li><strong>显式</strong>：你能 print(graph) 看到结构、能渲染成 mermaid 图、能单独测某个节点</li>
          <li><strong>隐式</strong>：调试只能 print 一堆中间变量，循环结构看不清</li>
        </ul>

        <div class="callout">
          💡 <strong>这就是为什么 2025 年起几乎所有生产 Agent 框架都走"显式图"路线</strong>：
          OpenAI Agents SDK 用 handoffs（也是图）、CrewAI 用 Crew + Task（也是图）、
          AutoGen 走 GraphFlow（显式图）。
        </div>
      `,
    },

    // ============ Stage 3: 项目代码 - _build_graph ============
    {
      kind: 'build',
      title: '搭建 Step 1：构建你的第一张图',
      content: `
        <p>看 <code>apps/api/app/agents/single/agent.py</code> 的 <code>_build_graph</code>：</p>

        <pre data-lang="python"><code>from langgraph.graph import StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

class SingleAgent:
    def __init__(self, session_id, tools=None, model=None):
        self.llm = ChatOpenAI(model=model or "gpt-4o-mini", streaming=True)
        self.tools = tools or _resolve_tools_sync()

        # 1️⃣ 把工具 schema 注入 LLM
        self.llm_with_tools = self.llm.bind_tools(self.tools)

        # 2️⃣ Checkpoint（M5 之前用 module-level singleton）
        self.checkpointer = _GLOBAL_CHECKPOINTER
        self.graph = self._build_graph()

    def _build_graph(self):
        # 3️⃣ ToolNode：内置节点，自动执行 LLM 的 tool_calls
        tool_node = ToolNode(self.tools)

        # 4️⃣ 创建图，state 用内置的 MessagesState
        workflow = StateGraph(MessagesState)

        # 5️⃣ 添加节点
        workflow.add_node("agent", self._agent_node)   # 自己定义
        workflow.add_node("tools", tool_node)          # 内置

        # 6️⃣ 设入口
        workflow.set_entry_point("agent")

        # 7️⃣ 条件边：根据 tools_condition 决定走 tools 还是 END
        workflow.add_conditional_edges("agent", tools_condition)

        # 8️⃣ 普通边：tools 执行完总是回到 agent
        workflow.add_edge("tools", "agent")

        # 9️⃣ 编译，传 checkpointer
        return workflow.compile(checkpointer=self.checkpointer)

    async def _agent_node(self, state):
        # 节点函数：输入 state，输出 dict 会 merge 到 state
        response = await self.llm_with_tools.ainvoke(state["messages"])
        return {"messages": [response]}
</code></pre>

        <h3>逐部分解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ bind_tools</strong>：<span class="hl">最容易忽略的一行</span>。
            没有这步，LLM 不知道有什么工具，永远不会输出 tool_calls。
            它做的事：把工具的 JSON Schema 通过 OpenAI Function Calling 协议注入给 LLM。
          </div>
          <div class="line">
            <strong>2️⃣ checkpointer</strong>：让对话状态可持久化。
            <span class="muted">注意：早期版本每次 new SingleAgent 就 new MemorySaver，
            会让"同一 session_id 跨请求拿不到历史"——这是个常见 bug，已修。</span>
          </div>
          <div class="line">
            <strong>3️⃣ ToolNode(self.tools)</strong>：<span class="hl">LangGraph 内置节点</span>，
            自动做这些事：
            <ul>
              <li>看最后一条 AIMessage 的 tool_calls</li>
              <li>对每个 tool_call 调对应工具</li>
              <li>把结果包成 ToolMessage 加到 messages</li>
              <li>支持并发执行多个工具调用</li>
            </ul>
          </div>
          <div class="line">
            <strong>4️⃣ MessagesState</strong>：内置 state 类型，等价于
            <code>{messages: list[AnyMessage]}</code>，自带<strong>消息合并语义</strong>
            （新消息追加而不是覆盖）。
          </div>
          <div class="line">
            <strong>5-6️⃣ add_node + set_entry_point</strong>：<span class="hl">注意 entry_point 必须是 STATE_NODE</span>，
            而不是 END。所有图都从某个真实节点开始，结束于 END。
          </div>
          <div class="line">
            <strong>7️⃣ add_conditional_edges("agent", tools_condition)</strong>：
            tools_condition 返回 "tools" 或 "__end__"。LangGraph 看返回值找对应分支。
          </div>
          <div class="line">
            <strong>8️⃣ tools → agent</strong>：闭环，让 ReAct 循环能循环。
          </div>
          <div class="line">
            <strong>9️⃣ compile(checkpointer=...)</strong>：编译成可执行的 graph。
            checkpointer 在这里传入，让所有节点执行后自动 save state。
          </div>
        </div>

        <div class="callout">
          🎯 <strong>关键洞察</strong>：上面这 30 行代码，等价于<br>
          "30 行 while 循环 + 自己实现 checkpoint + 自己实现 HITL + 自己实现流式" 的总和。
          这就是用 Runtime 的价值。
        </div>
      `,
    },

    // ============ Stage 4: 项目代码 - 流事件 ============
    {
      kind: 'build',
      title: '搭建 Step 2：astream_events 流式',
      content: `
        <p>看 <code>SingleAgent.stream</code>：</p>

        <pre data-lang="python"><code>async def stream(self, message: str, thread_id: str | None = None):
    thread_id = thread_id or self.session_id

    # 1️⃣ thread_id 通过 config.configurable 传入
    config = {"configurable": {"thread_id": thread_id}}

    sys = SystemMessage(content="你是一个助手...")
    messages = [sys, HumanMessage(content=message)]

    # 2️⃣ 用 astream_events 监听细粒度事件
    async for event in self.graph.astream_events(
        {"messages": messages},
        config=config,
        version="v1",
    ):
        kind = event["event"]

        # 3️⃣ LLM token 流
        if kind == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                yield {"type": "text", "content": content}

        # 4️⃣ 工具开始
        elif kind == "on_tool_start":
            tool_input = event.get("data", {}).get("input")
            yield {
                "type": "tool_calls",
                "data": {"name": event["name"], "input": tool_input}
            }

        # 5️⃣ 工具结束
        elif kind == "on_tool_end":
            tool_output = event.get("data", {}).get("output")
            yield {
                "type": "tool_result",
                "data": {"name": event["name"], "output": tool_output}
            }

    # 6️⃣ 显式 done 信号
    yield {"type": "done", "content": ""}
</code></pre>

        <h3>逐行解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ thread_id</strong>：<span class="hl">对话身份证</span>。
            相同 thread_id + 相同 checkpointer = LangGraph 能续上历史。
            本项目把 session_id 当 thread_id 用。
          </div>
          <div class="line">
            <strong>2️⃣ astream_events vs astream</strong>：
            <ul>
              <li><code>astream</code>：每个节点输出一次（粗粒度）</li>
              <li><code>astream_events</code>：每个 LLM token 一次（细粒度），适合驱动 UI</li>
            </ul>
          </div>
          <div class="line">
            <strong>3️⃣ on_chat_model_stream</strong>：每个 LLM token 触发一次。
            event["data"]["chunk"].content 是这个 token 的文本。
          </div>
          <div class="line">
            <strong>4-5️⃣ on_tool_start / on_tool_end</strong>：每次工具调用前后触发。
            <span class="hl">注意 event["name"] 是工具名</span>，不是节点名。
          </div>
          <div class="line">
            <strong>6️⃣ done 信号</strong>：自定义的，告诉前端"流真的结束了"。
            astream_events 自然结束后还要显式 yield 一个 done。
          </div>
        </div>

        <h3>📌 为什么 thread_id 这么重要</h3>

        <p>设想用户的对话历史：</p>
        <pre>第 1 轮：用户说"你好"，模型答"你好"
第 2 轮：用户说"我刚才说了什么"</pre>

        <p>第 2 轮要回答正确，模型必须能看到第 1 轮的对话。怎么做到？</p>

        <ol>
          <li>第 1 轮请求时 LangGraph 把 messages 存到 checkpointer，key 是 thread_id</li>
          <li>第 2 轮请求时，LangGraph 看 thread_id，<strong>自动从 checkpointer 加载</strong>历史 messages</li>
          <li>所以前端只需传新的一条消息，不用传完整历史</li>
        </ol>

        <div class="callout">
          🎯 <strong>三个条件缺一不可</strong>：
          <ol>
            <li>编译图时传了 checkpointer</li>
            <li>调用时 config 里传了 configurable.thread_id</li>
            <li>checkpointer 实例跨请求复用（不能每请求 new MemorySaver）</li>
          </ol>
        </div>
      `,
    },

    // ============ Stage 5: Mini-Quiz ============
    {
      kind: 'mini-quiz',
      title: '小测：LangGraph 核心',
      questions: [
        {
          id: 'm3s5q1',
          type: 'single',
          knowledgeTag: 'StateGraph',
          text: 'LangGraph 的 StateGraph 相比"自己写 while 循环"，最大的工程优势是什么？',
          options: [
            { text: '跑得更快', value: 'a' },
            { text: '图结构是显式的：天然支持 checkpoint / 流式 / HITL / 可观测，不用自己实现', value: 'b' },
            { text: '不需要写 Python', value: 'c' },
            { text: '自动选择最优模型' , value: 'd' }
          ],
          answer: 'b',
          explain: '显式图 = 每个节点执行后自动存档、自动产出事件、可以在任意节点暂停。这些用 while 循环都得手写。',
          deeper: '这也是为什么 2025 年起所有主流框架（OpenAI SDK / CrewAI / AutoGen）都走"显式图"路线。'
        },
        {
          id: 'm3s5q2',
          type: 'single',
          knowledgeTag: 'Checkpoint',
          text: '如果 checkpointer 每次请求都 new 一个新的 MemorySaver，会发生什么？',
          options: [
            { text: '没影响，MemorySaver 是全局的', value: 'a' },
            { text: '同一个 thread_id 的第二次请求拿不到第一次的对话历史，因为新 saver 里是空的', value: 'b' },
            { text: '会报错', value: 'c' },
            { text: '性能下降但功能正常' , value: 'd' }
          ],
          answer: 'b',
          explain: '这是本项目早期的真实 bug。修复方案：把 MemorySaver 提到模块级单例，所有请求共享同一个实例。',
          deeper: '生产环境用 AsyncSqliteSaver / AsyncPostgresSaver 放在 lifespan 里，彻底解决跨进程问题。'
        }
      ]
    },

    // ============ Stage 6: Final Quiz ============
    {
      kind: 'final-quiz',
      title: '通关测验：M3 LangGraph',
      passLine: 0.8,
      questions: [
        {
          id: 'm3fq1',
          type: 'single',
          knowledgeTag: 'Tool Calling',
          text: '删掉 <code>bind_tools</code> 会怎样？',
          options: [
            { text: '什么都不变', value: 'a' },
            { text: 'agent 仍跑，但 LLM 不知道工具存在，永远不输出 tool_calls', value: 'b' },
            { text: 'LangGraph 抛 ValidationError', value: 'c' },
            { text: '工具被随机调用' , value: 'd' }
          ],
          answer: 'b',
          explain: '工具 schema 必须通过 bind_tools 注入 LLM。',
        },
        {
          id: 'm3fq2',
          type: 'order',
          knowledgeTag: 'Tool Calling',
          text: '把一次完整 Tool Calling 循环按执行顺序排好',
          items: [
            { id: 'a', text: 'LLM 输出含 tool_calls 的 AIMessage' },
            { id: 'b', text: 'tools_condition 检查到含 tool_calls，路由到 tools' },
            { id: 'c', text: 'ToolNode 执行工具，结果作为 ToolMessage 加入 state' },
            { id: 'd', text: '回到 agent 节点，LLM 看到工具结果，生成最终回答（不含 tool_calls）' },
            { id: 'e', text: 'tools_condition 看到不含 tool_calls，路由到 END' }
          ],
          answer: ['a', 'b', 'c', 'd', 'e'],
          explain: 'ReAct 循环在 LangGraph 里的具体落地。',
        },
        {
          id: 'm3fq3',
          type: 'multi',
          knowledgeTag: 'Checkpoint',
          text: '同一用户两次请求传相同 thread_id，第二次能看到第一次历史。前提是？（多选）',
          options: [
            { text: '编译图时传了 checkpointer', value: 'a' },
            { text: '调用时 config 里传了 configurable.thread_id', value: 'b' },
            { text: 'Checkpointer 实例跨请求复用', value: 'c' },
            { text: '必须用 GPT-4', value: 'd' }
          ],
          answer: ['a', 'b', 'c'],
          explain: '三个条件缺一不可。',
        },
        {
          id: 'm3fq4',
          type: 'single',
          knowledgeTag: 'Checkpoint',
          text: 'MemorySaver 在生产环境的最大缺陷？',
          options: [
            { text: '不支持多线程', value: 'a' },
            { text: '只支持 OpenAI', value: 'b' },
            { text: '只在内存，进程重启就全丢；多进程部署各自独立', value: 'c' },
            { text: '速度太慢' , value: 'd' }
          ],
          answer: 'c',
          explain: 'MemorySaver 适合学习。生产换 AsyncSqliteSaver / AsyncPostgresSaver。',
        },
        {
          id: 'm3fq5',
          type: 'fill',
          knowledgeTag: '流事件',
          text: '想监听每个 LLM token 和工具开始/结束，用 graph 的哪个方法？（只填方法名）',
          hint: '提示：比 astream 更细粒度',
          answer: ['astream_events', 'graph.astream_events', 'self.graph.astream_events'],
          explain: 'graph.astream_events(input, config, version="v1")。事件包括 on_chat_model_stream / on_tool_start / on_tool_end。',
        }
      ]
    }
  ]
};
