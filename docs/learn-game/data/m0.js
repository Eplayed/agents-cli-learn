// M0 — Agent 入门：从零理解什么是 AI Agent
// 学习方式：故事 → 概念 → 项目代码 → 小测 → 通关测验

export default {
  id: 'M0',
  topic: 'Agent 入门',
  title: 'AI Agent 基础认知',
  subtitle: '从零理解 Agent 是什么、ReAct 范式、为什么需要 Runtime',

  stages: [
    // ============ Stage 1: 故事 ============
    {
      kind: 'story',
      title: '为什么会有 AI Agent？',
      content: `
        <p>2022 年底 ChatGPT 火爆之后，大家很快发现一个问题：</p>
        <blockquote>
          <strong>"模型只能聊天，干不了活。"</strong>
        </blockquote>
        <p>你问 ChatGPT 北京天气，它会编一段听起来合理的话——但它没有真的查天气。
        你让它帮你下单，它会回复"已下单"——但你的购物车空空如也。</p>

        <p>核心问题：<strong>纯 LLM 是个"知识容器"，不是"行动者"</strong>。它不能调 API、读文件、改数据库。</p>

        <p>于是工程师们开始尝试：</p>
        <ul>
          <li>能不能让模型 <strong>判断</strong>"这个问题需要查天气"？</li>
          <li>能不能让它 <strong>调用</strong>真实的天气 API？</li>
          <li>能不能让它 <strong>看到</strong> API 返回的结果，再生成回答？</li>
        </ul>

        <p>这就是 <strong>AI Agent</strong> 诞生的起点：让 LLM 不仅能"想"，还能"做"。</p>

        <div class="story-box">
          🎯 <strong>本关你将理解：</strong>
          <ul style="margin: 8px 0 0 0;">
            <li>Agent 和 Chatbot 的本质区别</li>
            <li>ReAct 范式：Agent 怎么"边想边做"</li>
            <li>为什么不能自己写 while 循环，而要用 Runtime（如 LangGraph）</li>
            <li>为什么本项目走 Web-only 路线</li>
          </ul>
        </div>
      `,
    },

    // ============ Stage 2: 概念 ============
    {
      kind: 'concept',
      title: '核心概念：Agent = LLM + 工具 + 循环',
      content: `
        <h3>📌 一句话定义</h3>
        <p style="font-size: 16px; color: var(--text);">
          <strong>Agent = LLM 大脑 + 工具手脚 + 循环驱动</strong>
        </p>

        <h3>📌 ReAct 范式（2022 年提出，今天仍是事实标准）</h3>
        <p>Agent 的每一步都遵循这个循环：</p>
        <pre>Thought（思考）→ Action（行动）→ Observation（观察）→ 再次 Thought…</pre>

        <p>举个具体例子，用户问"北京今天适合洗车吗？"：</p>

        <div class="example-flow">
          <div class="step">
            <span class="step-num">1</span>
            <strong>Thought</strong>：要回答"是否适合洗车"，我得先知道天气。
          </div>
          <div class="step">
            <span class="step-num">2</span>
            <strong>Action</strong>：调用 <code>get_weather(city="北京")</code>
          </div>
          <div class="step">
            <span class="step-num">3</span>
            <strong>Observation</strong>：拿到结果"晴，降雨概率 10%，风速 5m/s"
          </div>
          <div class="step">
            <span class="step-num">4</span>
            <strong>Thought</strong>：降雨概率低、风不大 → 适合洗车
          </div>
          <div class="step">
            <span class="step-num">5</span>
            <strong>回答用户</strong>：今天北京适合洗车，降雨概率仅 10%……
          </div>
        </div>

        <h3>📌 Agent vs Chatbot</h3>
        <table class="compare-table">
          <thead><tr><th></th><th>Chatbot</th><th>Agent</th></tr></thead>
          <tbody>
            <tr><td>能力</td><td>只生成文字</td><td>能调用工具、改变外部状态</td></tr>
            <tr><td>循环</td><td>一次问一次答</td><td>多步循环直到任务完成</td></tr>
            <tr><td>可靠性</td><td>会"幻觉"瞎编</td><td>有真实数据支撑</td></tr>
            <tr><td>例子</td><td>早期 ChatGPT 网页</td><td>Cursor / Claude Code / 你的项目</td></tr>
          </tbody>
        </table>

        <div class="callout">
          💡 <strong>记住</strong>：判断一个东西是不是 Agent，看它能不能"做"事，不是看它说什么。
        </div>
      `,
    },

    // ============ Stage 3: Mini-Quiz ============
    {
      kind: 'mini-quiz',
      title: '小测：你理解 Agent 了吗？',
      questions: [
        {
          id: 'm0s3q1',
          type: 'single',
          knowledgeTag: 'Agent 定义',
          text: '下面哪个最准确地描述"Agent"和"Chatbot"的本质区别？',
          options: [
            { text: 'Agent 用更大的模型', value: 'a' },
            { text: 'Agent 能调工具改变外部世界并多轮循环，Chatbot 只生成文字', value: 'b' },
            { text: 'Agent 必须联网', value: 'c' },
            { text: 'Agent 用 Python 写' , value: 'd' }
          ],
          answer: 'b',
          explain: '区别在「能否对外部世界产生副作用」+「是否多轮自主推进」。模型大小、语言、是否联网都不是本质。',
          deeper: '一个能查天气的 Bot 是 Agent；一个会回话但不能调工具的 ChatGPT 网页只是 Chatbot。'
        },
        {
          id: 'm0s3q2',
          type: 'order',
          knowledgeTag: 'ReAct 范式',
          text: '把 ReAct 论文里 Agent 一次决策循环按正确顺序排好',
          items: [
            { id: 'thought', text: 'Thought（思考）：基于当前观察，决定下一步做什么' },
            { id: 'action', text: 'Action（行动）：选一个工具并给出参数' },
            { id: 'observation', text: 'Observation（观察）：拿到工具执行结果' },
            { id: 'next', text: '判断任务是否完成，未完成则回到 Thought' }
          ],
          answer: ['thought', 'action', 'observation', 'next'],
          explain: 'ReAct = Reason + Act 交替。每轮：先思考、再行动、再观察、再判断是否结束。',
          deeper: 'OpenAI Function Calling / Anthropic Tool Use 都是这个循环的具体协议化。'
        }
      ],
    },

    // ============ Stage 4: 概念 ============
    {
      kind: 'concept',
      title: '为什么需要 Agent Runtime（如 LangGraph）？',
      content: `
        <p>看了 ReAct 循环你可能想：<strong>这不就是个 while 循环吗？我自己写不就行？</strong></p>

        <p>没错，纯 ReAct 循环 30 行 Python 就能写出来：</p>
        <pre><code>messages = [system, user]
while True:
    response = llm.invoke(messages)
    messages.append(response)
    if not response.tool_calls:
        break
    for call in response.tool_calls:
        result = execute_tool(call)
        messages.append(result)</code></pre>

        <p>但生产 Agent 远不止这些。你会立刻撞到这些问题：</p>

        <table class="compare-table">
          <thead><tr><th>需求</th><th>自己写</th><th>用 Runtime（LangGraph）</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>持久化</strong>：用户中断后能继续</td>
              <td>自己设计 DB schema + 序列化逻辑</td>
              <td>内置 Checkpoint，一行代码搞定</td>
            </tr>
            <tr>
              <td><strong>流式</strong>：让前端实时看到 token</td>
              <td>自己实现 SSE/NDJSON + 事件分发</td>
              <td>内置 astream_events，按需消费</td>
            </tr>
            <tr>
              <td><strong>HITL</strong>：危险操作前人工审批</td>
              <td>自己实现"暂停/恢复"机制</td>
              <td>用 interrupt() 一行</td>
            </tr>
            <tr>
              <td><strong>可观测</strong>：每步在哪、用了多少 token</td>
              <td>到处插日志</td>
              <td>原生支持 OpenTelemetry / Langfuse</td>
            </tr>
            <tr>
              <td><strong>子图/复杂控制流</strong></td>
              <td>嵌套 while 噩梦</td>
              <td>StateGraph 显式建模</td>
            </tr>
          </tbody>
        </table>

        <div class="callout">
          💡 <strong>关键洞察</strong>：生产 Agent 的难点 <strong>从来不是"模型怎么思考"</strong>，
          而是"状态怎么管、流式怎么传、错怎么恢、怎么观察"。这就是 2024-2026
          Agent 框架军备竞赛的本质：谁的 Runtime 工程能力强，谁就赢。
        </div>

        <h3>📌 主流 Runtime 对比（2026）</h3>
        <ul>
          <li><strong>LangGraph 1.x</strong>（你的项目用的）：StateGraph 显式建模，工业落地最广</li>
          <li><strong>OpenAI Agents SDK</strong>：handoff 链式调用，OpenAI 生态首选</li>
          <li><strong>CrewAI</strong>：Role + Task 抽象，适合多角色协作</li>
        </ul>
      `,
    },

    // ============ Stage 5: 项目代码 ============
    {
      kind: 'build',
      title: '看代码：你的项目第一行 Agent 代码长什么样',
      content: `
        <p>现在打开你的项目文件 <code>apps/api/app/agents/single/agent.py</code>，
        看下面这段（精简版）：</p>

        <pre data-lang="python"><code>from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph
from langgraph.graph.message import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

class SingleAgent:
    def __init__(self, session_id: str):
        # 1️⃣ 创建 LLM
        self.llm = ChatOpenAI(model="gpt-4o-mini", streaming=True)

        # 2️⃣ 把工具 schema 注入 LLM（关键！）
        self.llm_with_tools = self.llm.bind_tools(self.tools)

        # 3️⃣ 用 StateGraph 把 ReAct 循环画成图
        workflow = StateGraph(MessagesState)
        workflow.add_node("agent", self._agent_node)        # 思考节点
        workflow.add_node("tools", ToolNode(self.tools))    # 行动节点
        workflow.set_entry_point("agent")
        workflow.add_conditional_edges("agent", tools_condition)  # 是否要调工具？
        workflow.add_edge("tools", "agent")                  # 调完工具回到思考
        self.graph = workflow.compile(checkpointer=...)
</code></pre>

        <h3>逐行解读</h3>

        <div class="code-explain">
          <div class="line"><strong>1️⃣ ChatOpenAI</strong>：LangChain 包装的 OpenAI 客户端，<code>streaming=True</code> 让 token 一个一个吐</div>
          <div class="line"><strong>2️⃣ bind_tools</strong>：<span class="hl">这是 ReAct 能成立的关键</span>——把工具的 JSON Schema 注入 LLM 的 system 上下文，模型才知道"我可以调什么、参数是什么"</div>
          <div class="line"><strong>3️⃣ StateGraph</strong>：把 ReAct 循环显式画出来：
            <pre>START → agent → (有 tool_calls?) ─┬─ yes → tools → agent
                                  └─ no  → END</pre>
          </div>
          <div class="line"><strong>tools_condition</strong>：内置函数，检查 LLM 输出有没有 tool_calls，决定走哪条边</div>
          <div class="line"><strong>checkpointer</strong>：让对话状态可持久化（你 M5 会换成 SQLite saver）</div>
        </div>

        <div class="callout">
          🔍 <strong>对比刚才的 30 行 while 循环</strong>：表面上做的事一样，但 LangGraph 版本天然支持
          流式、checkpoint、HITL、可观测——这些都是<strong>免费</strong>的，因为图结构是显式的。
        </div>

        <h3>📂 项目里相关文件位置</h3>
        <pre>apps/api/app/agents/single/agent.py     ← 单 Agent 主体（重点看 _build_graph）
apps/api/app/agents/multi/team.py        ← 多 Agent 4 模式
apps/api/app/main.py                     ← FastAPI 入口</pre>
      `,
    },

    // ============ Stage 6: 概念 ============
    {
      kind: 'concept',
      title: '为什么这个项目走 Web-only 路线？',
      content: `
        <p>你可能会好奇：CowAgent / dify 都支持微信、飞书、钉钉，为什么我们项目偏偏不接？</p>

        <h3>🎯 学习项目的"聚焦"原则</h3>
        <p>Agent 工程的核心知识可以拆成 3 层：</p>

        <div class="layer-stack">
          <div class="layer top">
            <strong>通道层</strong>：微信 / 飞书 / Slack / Web UI<br>
            <span class="muted">→ 工程问题，不是 Agent 学习的核心</span>
          </div>
          <div class="layer mid">
            <strong>Agent 层</strong>：Runtime / 工具协议 / 流式 / 状态<br>
            <span class="muted">→ <strong style="color: var(--accent);">这是你要学的核心</strong></span>
          </div>
          <div class="layer bot">
            <strong>模型层</strong>：OpenAI / Anthropic / Qwen<br>
            <span class="muted">→ 调 API 即可，无需深入</span>
          </div>
        </div>

        <p>多通道适配会分散学习焦点：</p>
        <ul>
          <li>每个通道有自己的认证流程</li>
          <li>每个通道的消息格式不同</li>
          <li>调试一个微信回调要花一小时</li>
        </ul>

        <p>Web-only 让你聚焦：<strong>用一个最简单的 HTML 页面 + fetch，就能验证所有 Agent 能力</strong>。</p>

        <div class="callout">
          🎯 <strong>关键</strong>：等你打牢了 Agent 核心层，加任何通道都是 1-2 天的工程活。
          但反过来不成立：从通道反推 Agent，会一直在工程细节里打转。
        </div>

        <h3>📌 你的项目现状</h3>
        <pre>apps/web/public/ui/index.html    ← 一个 HTML，不到 1500 行
apps/api/                        ← Python FastAPI 后端</pre>

        <p>就这么简单。前端不用 React/Vue/构建工具，后端是标准 FastAPI。
        所有"复杂度"都集中在 Agent 逻辑本身。</p>
      `,
    },

    // ============ Stage 7: 常见疑问 ============
    {
      kind: 'concept',
      title: '❓ 小白常见疑问（FAQ）',
      content: `
        <h3>Q1：Agent 有 10 个工具，它怎么知道该调哪个？</h3>
        <p><strong>靠 description（描述），不是关键字匹配。</strong></p>
        <p>你给每个工具写了描述（如"查询城市天气"），LLM 每次收到用户消息时，
        会同时看到所有工具的描述，用<strong>语义理解</strong>判断"用户意图和哪个工具最相关"。</p>
        <p>这不是 <code>if "天气" in 消息</code> 这种规则匹配，而是模型层面的语义匹配。
        所以 description 写得好非常重要——写不好模型就选错工具。</p>

        <h3>Q2：如果没有匹配的工具呢？Agent 会怎样？</h3>
        <p><strong>直接用自己的知识回答，不调工具。</strong></p>
        <p>比如用户说"帮我写首诗"，没有任何工具和写诗相关 → LLM 不输出 tool_calls
        → 图走 END → 直接返回 LLM 生成的文本。此时 Agent 退化为普通 Chatbot。</p>

        <h3>Q3：Chatbot 和 Agent 的区别，能不能用一个最简单的比喻？</h3>
        <p><strong>Chatbot = 只会说的人（瞎编天气），Agent = 会查手机再告诉你的人（查了 App 再说）。</strong></p>
        <p>区别在"有没有做一个动作（调工具）"。在你项目里，切到 M0 模式问天气会瞎编，切到 M4 模式会真查 API。</p>

        <h3>Q4：Agent 是不是就是比 Chatbot 多了"调 API"这一步？</h3>
        <p>不只是"多调一个 API"。Agent 的关键是<strong>循环</strong>：</p>
        <ul>
          <li>调一个工具还不够？再调一个</li>
          <li>第一个结果不满意？换个方式再试</li>
          <li>多步推理：先查天气 → 再查降雨 → 最后综合给建议</li>
        </ul>
        <p>Chatbot 一次生成就结束了，Agent 可以自主决定"还要再做什么"直到任务完成。</p>
      `,
    },

    // ============ Stage 8: Final Quiz ============
    {
      kind: 'final-quiz',
      title: '通关测验：5 题验证你已经掌握 M0',
      passLine: 0.8,
      questions: [
        {
          id: 'm0fq1',
          type: 'single',
          knowledgeTag: 'Agent 定义',
          text: '下面哪个最准确地描述"AI Agent"和"Chatbot"的本质区别？',
          options: [
            { text: 'Agent 用更大的模型', value: 'a' },
            { text: 'Agent 能调工具改变外部世界并多轮循环', value: 'b' },
            { text: 'Agent 必须联网', value: 'c' },
            { text: 'Agent 用 Python 写' , value: 'd' }
          ],
          answer: 'b',
          explain: '区别在「能否对外部世界产生副作用」+「是否多轮自主推进」。',
        },
        {
          id: 'm0fq2',
          type: 'order',
          knowledgeTag: 'ReAct 范式',
          text: '把 ReAct 一次决策循环按正确顺序排好',
          items: [
            { id: 'thought', text: 'Thought（思考）' },
            { id: 'action', text: 'Action（行动）' },
            { id: 'observation', text: 'Observation（观察）' },
            { id: 'next', text: '判断是否完成，未完成回 Thought' }
          ],
          answer: ['thought', 'action', 'observation', 'next'],
          explain: 'ReAct = Reason + Act 交替。',
        },
        {
          id: 'm0fq3',
          type: 'multi',
          knowledgeTag: '架构原则',
          text: '为什么"生产 Agent"通常用 LangGraph 这类 Runtime 而不是自己写 while 循环？（多选）',
          options: [
            { text: '需要持久化状态以便重启恢复', value: 'a' },
            { text: '需要流式输出 + 工具调用事件', value: 'b' },
            { text: '需要在危险工具前人工确认', value: 'c' },
            { text: 'LLM 不允许自己写循环', value: 'd' },
            { text: '需要每步可观测追踪', value: 'e' }
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: '生产难点不是"模型循环"，而是状态/流式/HITL/可观测。',
        },
        {
          id: 'm0fq4',
          type: 'single',
          knowledgeTag: '技术选型',
          text: '关于本项目的 LangGraph + FastAPI 组合，下面哪句话不对？',
          options: [
            { text: 'LangGraph 把 Agent 抽象成显式状态机，比隐式 chain 易调试', value: 'a' },
            { text: 'FastAPI 原生异步 + 自动 OpenAPI 文档', value: 'b' },
            { text: 'LangGraph 自带前端 UI，不需要单独写前端', value: 'c' },
            { text: 'LangGraph 1.x 已 GA，对接 MCP/OTel/Langfuse 完善' , value: 'd' }
          ],
          answer: 'c',
          explain: 'LangGraph 是 Runtime，不带 UI。前端可以用 langchain-ai/agent-chat-ui。',
        },
        {
          id: 'm0fq5',
          type: 'single',
          knowledgeTag: 'Web-only',
          text: '为什么本项目不实现"接入微信/飞书"？',
          options: [
            { text: '通道接入是工程问题，不是 Agent 核心；Web-only 让我们聚焦 Runtime 层', value: 'a' },
            { text: 'Web 比微信安全', value: 'b' },
            { text: 'Python 不能写微信机器人', value: 'c' },
            { text: '学习项目不能商用' , value: 'd' }
          ],
          answer: 'a',
          explain: 'CowAgent 强项是多通道，但不是 Agent 学习的核心。先打牢核心再谈通道。',
        }
      ]
    }
  ],
};
