// M6 — 可观测性：让你能看到 Agent 每一步做了什么

export default {
  id: 'M6',
  topic: '可观测性',
  title: '让 Agent 的每一步"可见"',
  subtitle: 'Langfuse 追踪 / trace_id / 调试排查 / 性能分析',

  stages: [
    {
      kind: 'story',
      title: '为什么需要"看见"Agent 的每一步？',
      content: `
        <p>Agent 出了问题时你会发现：<strong>不知道它到底做了什么。</strong></p>

        <div class="story-box">
          😱 <strong>没有可观测的调试体验：</strong>
          <ol>
            <li>用户说"Agent 回答错了"</li>
            <li>你看日志：只有一条"请求进来了"和"响应出去了"</li>
            <li>中间发生了什么？调了什么工具？参数是什么？工具返回了什么？LLM 为什么忽略了工具结果？</li>
            <li>🤷 完全不知道</li>
          </ol>
        </div>

        <p><strong>可观测 = 给 Agent 装"行车记录仪"</strong>——每次请求的完整执行树（谁调了谁、传了什么、花了多久）都自动记录。</p>

        <div class="story-box">
          🎯 <strong>本关你将理解：</strong>
          <ul>
            <li>Trace / Span / Event 三级结构</li>
            <li>Langfuse 是什么、怎么接入</li>
            <li>trace_id 怎么贯穿全链路</li>
            <li>出问题时怎么用 trace 定位</li>
          </ul>
        </div>
      `,
    },

    {
      kind: 'concept',
      title: 'Trace / Span / Event 三级结构',
      content: `
        <h3>📌 可观测的核心数据模型</h3>

        <pre>Trace（一次完整的用户请求）
├── Span: LLM 调用（输入 messages / 输出 AIMessage / token 消耗 / 延迟）
├── Span: 工具执行
│   ├── Event: tool_start（工具名 + 参数）
│   └── Event: tool_end（返回结果 + 耗时）
├── Span: 第二次 LLM 调用（基于工具结果生成回答）
└── Metadata: 总耗时 / 总 token / session_id / user_id</pre>

        <h3>📌 类比</h3>
        <table class="compare-table">
          <thead><tr><th>概念</th><th>类比</th><th>记录什么</th></tr></thead>
          <tbody>
            <tr><td><strong>Trace</strong></td><td>一次完整的就医</td><td>从挂号到出院的全程</td></tr>
            <tr><td><strong>Span</strong></td><td>一次检查（验血/CT/问诊）</td><td>每个步骤的输入输出和耗时</td></tr>
            <tr><td><strong>Event</strong></td><td>检查中的细节</td><td>具体的数据点</td></tr>
          </tbody>
        </table>

        <h3>📌 Langfuse 是什么</h3>
        <p><strong>Langfuse = LLM 应用的"行车记录仪"平台</strong>。开源可自托管，也有云版本。</p>
        <ul>
          <li>自动记录每次 LLM 调用的输入/输出/token/延迟</li>
          <li>可视化执行树（agent → tool → LLM → tool → LLM → answer）</li>
          <li>支持 LangChain / LangGraph 一行接入</li>
          <li>和 OpenTelemetry 标准兼容</li>
        </ul>

        <div class="callout">
          💡 <strong>为什么选 Langfuse？</strong>
          <ul>
            <li>开源自托管（不锁厂商）</li>
            <li>对 LangGraph 原生支持</li>
            <li>有免费云版本（学习够用）</li>
            <li>对比 LangSmith：Langfuse 开源且不绑定 LangChain 生态</li>
          </ul>
        </div>
      `,
    },

    {
      kind: 'build',
      title: '搭建：接入 Langfuse',
      content: `
        <p>你项目里怎么接入的（<code>app/core/tracing.py</code>）：</p>

        <pre data-lang="python"><code>from langfuse.callback import CallbackHandler

def get_langfuse_handler(session_id=None, user_id=None):
    if not is_tracing_enabled():
        return None  # 没配置 key → 不追踪（不报错）

    return CallbackHandler(
        session_id=session_id,
        user_id=user_id,
        trace_name="agent-chat",
    )</code></pre>

        <p>在 Agent 的 stream 方法里注入：</p>

        <pre data-lang="python"><code>config = {
    "configurable": {"thread_id": thread_id},
    "recursion_limit": 25,
}

# M6：注入追踪
from app.core.tracing import get_tracing_config
tracing = get_tracing_config(session_id=thread_id)
if tracing:
    config.update(tracing)  # 加 callbacks=[handler]

# 之后 astream_events 用这个 config → 自动追踪
async for event in self.graph.astream_events(input, config=config, ...):
    ...</code></pre>

        <h3>关键设计</h3>
        <div class="code-explain">
          <div class="line">
            <strong>没配置就不追踪</strong>：<code>is_tracing_enabled()</code> 检查环境变量。
            不配 = 零开销，不影响正常功能。
          </div>
          <div class="line">
            <strong>一行注入</strong>：只要 config 里有 <code>callbacks=[handler]</code>，
            LangGraph 自动把每个节点的执行上报给 Langfuse。
          </div>
          <div class="line">
            <strong>session_id 关联</strong>：trace 和会话关联，
            在 Langfuse 控制台能按会话筛选所有 trace。
          </div>
        </div>

        <h3>📌 怎么配置</h3>
        <p>在 <code>.env.dev</code> 加三行：</p>
        <pre><code>LANGFUSE_PUBLIC_KEY=pk-xxx
LANGFUSE_SECRET_KEY=sk-xxx
LANGFUSE_HOST=https://cloud.langfuse.com</code></pre>

        <p>免费注册 <a href="https://cloud.langfuse.com" target="_blank">cloud.langfuse.com</a> 获取 key。</p>

        <div class="callout">
          🔍 <strong>验证</strong>：配置后对话一次，去 Langfuse 控制台看到一条 trace → 成功！
        </div>
      `,
    },

    {
      kind: 'mini-quiz',
      title: '小测：可观测基础',
      questions: [
        {
          id: 'm6s4q1',
          type: 'single',
          knowledgeTag: '可观测',
          text: 'Trace / Span / Event 三者的关系是？',
          options: [
            { text: '三个是同一层级', value: 'a' },
            { text: 'Trace 包含多个 Span，Span 包含多个 Event（从大到小）', value: 'b' },
            { text: 'Event 是最大的', value: 'c' },
            { text: 'Span 包含 Trace', value: 'd' }
          ],
          answer: 'b',
          explain: 'Trace = 一次完整请求；Span = 其中一步操作（如 LLM 调用、工具执行）；Event = 步骤里的细节数据点。',
        },
        {
          id: 'm6s4q2',
          type: 'single',
          knowledgeTag: '可观测',
          text: '为什么本项目选 Langfuse 而不是 LangSmith？',
          options: [
            { text: 'Langfuse 更快', value: 'a' },
            { text: 'Langfuse 开源可自托管、不绑定 LangChain 生态、有免费云版本', value: 'b' },
            { text: 'LangSmith 已经停止维护', value: 'c' },
            { text: '没区别随便选', value: 'd' }
          ],
          answer: 'b',
          explain: 'LangSmith 是 LangChain 官方的商业产品。Langfuse 开源 + 支持所有框架 + 可自托管 = 不锁厂商。',
        }
      ]
    },

    {
      kind: 'final-quiz',
      title: '通关测验：M6 可观测',
      passLine: 0.8,
      questions: [
        {
          id: 'm6fq1',
          type: 'single',
          knowledgeTag: '可观测',
          text: 'Agent 回答错了，你怎么排查？',
          options: [
            { text: '看日志猜', value: 'a' },
            { text: '查 trace：看完整执行树 → 定位是工具返回错了、还是 LLM 忽略了工具结果、还是幻觉', value: 'b' },
            { text: '重启试试', value: 'c' },
            { text: '问用户重新说', value: 'd' }
          ],
          answer: 'b',
          explain: '可观测的核心价值：每次请求有 trace → 能看到每一步的输入输出 → 精确定位问题出在哪。',
        },
        {
          id: 'm6fq2',
          type: 'multi',
          knowledgeTag: '可观测',
          text: '一条 Trace 里通常能看到哪些信息？（多选）',
          options: [
            { text: 'LLM 的输入 messages 和输出', value: 'a' },
            { text: '每次工具调用的参数和返回值', value: 'b' },
            { text: 'Token 消耗和延迟', value: 'c' },
            { text: '用户的密码', value: 'd' },
            { text: 'session_id 和 user_id', value: 'e' }
          ],
          answer: ['a', 'b', 'c', 'e'],
          explain: 'Trace 记录完整执行链路的所有关键数据：LLM IO + 工具 IO + metrics + 关联标识。不应记录敏感信息。',
        },
        {
          id: 'm6fq3',
          type: 'single',
          knowledgeTag: '可观测',
          text: 'Langfuse 的 callback handler 在哪注入？',
          options: [
            { text: '在前端 JavaScript 里', value: 'a' },
            { text: '在 astream_events 的 config 里传入 callbacks=[handler]', value: 'b' },
            { text: '在数据库里配置', value: 'c' },
            { text: '在 .env 文件里写一行就行', value: 'd' }
          ],
          answer: 'b',
          explain: 'config 里加 callbacks → LangGraph 执行每个节点时自动调用 handler 上报数据。.env 只是配 key，注入点在 config。',
        },
        {
          id: 'm6fq4',
          type: 'single',
          knowledgeTag: '可观测',
          text: '如果没配置 LANGFUSE_PUBLIC_KEY，Agent 会怎样？',
          options: [
            { text: '启动报错', value: 'a' },
            { text: '正常运行但不追踪（零影响）', value: 'b' },
            { text: '所有请求返回 500', value: 'c' },
            { text: '只能用 M0 模式', value: 'd' }
          ],
          answer: 'b',
          explain: '设计原则：可观测是"加分项"不是"必要条件"。没配 key → is_tracing_enabled()=False → 不注入 handler → 一切正常。',
        },
      ]
    }
  ]
};
