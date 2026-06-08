// M5 — Checkpoint 持久化 + 预算控制 + 鉴权中间件

export default {
  id: 'M5',
  topic: '持久化与安全',
  title: '让 Agent 记住对话、不烧钱、有门禁',
  subtitle: 'AsyncSqliteSaver / recursion_limit / Bearer Token / HITL 确认',

  stages: [
    {
      kind: 'story',
      title: '三个生产必备的"安全网"',
      content: `
        <p>M4 做完后 Agent 功能很强了。但如果直接上线，会遇到 3 个致命问题：</p>

        <div class="story-box">
          😱 <strong>生产三大灾难：</strong>
          <ol>
            <li><strong>重启丢记忆</strong>：MemorySaver 在内存里，API 一重启，所有对话历史全没</li>
            <li><strong>LLM 死循环烧钱</strong>：模型有时会反复调工具不停，没有刹车 = 无限费用</li>
            <li><strong>谁都能调</strong>：没有鉴权，任何人知道你的 URL 就能用你的 OpenAI Key</li>
          </ol>
        </div>

        <p>M5 就是给 Agent 加上这 3 张安全网：</p>
        <ul>
          <li>🗄 <strong>Checkpoint 持久化</strong>：对话状态写入 SQLite 文件，重启不丢</li>
          <li>🛑 <strong>预算控制</strong>：recursion_limit + max_tokens + timeout，三层刹车</li>
          <li>🔐 <strong>鉴权中间件</strong>：Bearer Token + ContextVar 协程隔离</li>
        </ul>
      `,
    },

    {
      kind: 'concept',
      title: 'Checkpoint 持久化：从 MemorySaver 到 AsyncSqliteSaver',
      content: `
        <h3>📌 为什么 MemorySaver 不行？</h3>
        <table class="compare-table">
          <thead><tr><th></th><th>MemorySaver</th><th>AsyncSqliteSaver</th></tr></thead>
          <tbody>
            <tr><td>存储位置</td><td>进程内存</td><td>SQLite 文件（checkpoints.db）</td></tr>
            <tr><td>重启后</td><td>全丢</td><td>保留</td></tr>
            <tr><td>多进程</td><td>各自独立</td><td>共享同一文件</td></tr>
            <tr><td>适用场景</td><td>学习/测试</td><td>单机生产</td></tr>
          </tbody>
        </table>

        <h3>📌 关键代码</h3>
        <pre><code># app/core/checkpointer.py
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

@asynccontextmanager
async def create_checkpointer():
    async with AsyncSqliteSaver.from_conn_string("./checkpoints.db") as saver:
        await saver.setup()  # 自动建表
        yield saver</code></pre>

        <h3>📌 在 lifespan 里初始化</h3>
        <pre><code># app/main.py
async with create_checkpointer() as checkpointer:
    app.state.checkpointer = checkpointer  # 全局共享
    yield</code></pre>

        <div class="callout">
          💡 <strong>关键</strong>：checkpointer 在 lifespan 里创建一次，通过 app.state 传给所有 Agent。
          不是每请求新建——否则又回到 MemorySaver 的老坑。
        </div>
      `,
    },

    {
      kind: 'concept',
      title: '预算控制：三层刹车防烧钱',
      content: `
        <h3>📌 三层预算防线</h3>
        <table class="compare-table">
          <thead><tr><th>层</th><th>参数</th><th>防什么</th><th>值</th></tr></thead>
          <tbody>
            <tr><td>1</td><td><code>recursion_limit</code></td><td>LLM 死循环（反复调工具不停）</td><td>25</td></tr>
            <tr><td>2</td><td><code>max_tokens</code></td><td>单次生成超长文本</td><td>4096</td></tr>
            <tr><td>3</td><td><code>request_timeout</code></td><td>单次 API 调用卡死</td><td>60 秒</td></tr>
          </tbody>
        </table>

        <h3>📌 怎么加</h3>
        <pre><code># agent.py
self.llm = ChatOpenAI(
    ...,
    max_tokens=4096,          # 层 2
    request_timeout=60,       # 层 3
)

# stream() 里
config = {
    "configurable": {"thread_id": thread_id},
    "recursion_limit": 25,    # 层 1
}</code></pre>

        <div class="callout">
          🛑 <strong>recursion_limit</strong> 是最重要的一层。没有它，一个"帮我搜索直到找到满意的答案"
          的 prompt 可能让 Agent 无限循环调工具，每次都花 token 钱。
        </div>
      `,
    },

    {
      kind: 'build',
      title: '鉴权中间件：ContextVar + Bearer Token',
      content: `
        <p>看 <code>apps/api/app/core/auth.py</code> 的核心设计：</p>

        <pre data-lang="python"><code>from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware

# 1️⃣ ContextVar：每个协程独立的用户上下文
_current_user: ContextVar[Optional[UserContext]] = ContextVar(
    "current_user", default=None
)

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        user_context = self._resolve_user(request)
        # 2️⃣ set() 返回还原句柄（不是 JWT token）
        cv_token = _current_user.set(user_context)
        try:
            return await call_next(request)
        finally:
            # 3️⃣ 必须 reset，防止协程复用时泄漏
            _current_user.reset(cv_token)

def get_current_user() -> UserContext:
    # 4️⃣ 业务层调用，未认证时统一 401
    user = _current_user.get()
    if not user or not user.authenticated:
        raise HTTPException(status_code=401, ...)
    return user</code></pre>

        <h3>关键设计决策</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ 为什么用 ContextVar？</strong>
            FastAPI 并发时多个请求在不同协程中执行。
            <span class="hl">全局变量会被覆盖</span>，ContextVar 每个协程独立。
          </div>
          <div class="line">
            <strong>2️⃣ AUTH_SECRET 为空 → 放开</strong>
            开发时不设密钥 = 所有请求自动通过。设了才检查 Bearer token。
            <span class="muted">参考 agent-service-toolkit 的 verify_bearer 设计。</span>
          </div>
          <div class="line">
            <strong>3️⃣ 中间件不直接 401</strong>
            /health、/docs 不需要鉴权。中间件只"标记"身份，
            由 <code>get_current_user()</code> 在需要鉴权的地方才抛 401。
          </div>
          <div class="line">
            <strong>4️⃣ finally 里 reset</strong>
            协程池复用时，上一个请求的 context 可能残留。
            <span class="hl">不 reset = 安全漏洞</span>。
          </div>
        </div>

        <div class="callout">
          🔍 <strong>验证方式</strong>：在 .env.dev 加 <code>AUTH_SECRET=my-token</code>，
          然后不带 header 调 API → 401；带 <code>-H "Authorization: Bearer my-token"</code> → 正常。
        </div>
      `,
    },

    {
      kind: 'mini-quiz',
      title: '小测：M5 核心概念',
      questions: [
        {
          id: 'm5s4q1',
          type: 'single',
          knowledgeTag: 'Checkpoint',
          text: 'AsyncSqliteSaver 相比 MemorySaver 最核心的改进是什么？',
          options: [
            { text: '速度更快', value: 'a' },
            { text: '对话状态持久化到文件，进程重启后 thread_id 对应的历史仍在', value: 'b' },
            { text: '支持更多 LLM 模型', value: 'c' },
            { text: '自动压缩对话历史', value: 'd' }
          ],
          answer: 'b',
          explain: 'MemorySaver 只在内存，重启全丢。AsyncSqliteSaver 写入 checkpoints.db 文件，重启后恢复。',
        },
        {
          id: 'm5s4q2',
          type: 'single',
          knowledgeTag: '鉴权',
          text: '为什么用 ContextVar 而不是全局变量存用户身份？',
          options: [
            { text: 'ContextVar 更快', value: 'a' },
            { text: 'FastAPI 并发时多协程共存，全局变量会互相覆盖；ContextVar 每个协程独立', value: 'b' },
            { text: '全局变量不能存对象', value: 'c' },
            { text: 'Python 不支持全局变量', value: 'd' }
          ],
          answer: 'b',
          explain: '并发安全的关键。10 个请求同时进来，全局变量只能存一个 user_id，ContextVar 能存 10 个互不干扰。',
        }
      ]
    },

    {
      kind: 'final-quiz',
      title: '通关测验：M5 持久化与安全',
      passLine: 0.8,
      questions: [
        {
          id: 'm5fq1',
          type: 'single',
          knowledgeTag: 'Checkpoint',
          text: 'AsyncSqliteSaver 应该在哪里创建？',
          options: [
            { text: '每个请求的路由函数里', value: 'a' },
            { text: 'lifespan 里创建一次，通过 app.state 全局共享', value: 'b' },
            { text: '每个 SingleAgent 构造时', value: 'c' },
            { text: '在 .env 文件里配置', value: 'd' }
          ],
          answer: 'b',
          explain: 'lifespan 创建一次 + app.state 共享 = 所有请求复用同一个 saver。和 M4 之前 MemorySaver 单例是同一思路，只是持久化了。',
        },
        {
          id: 'm5fq2',
          type: 'multi',
          knowledgeTag: '预算控制',
          text: '本项目的三层预算防线是哪些？（多选）',
          options: [
            { text: 'recursion_limit=25：图最多执行 25 步', value: 'a' },
            { text: 'max_tokens=4096：单次 LLM 生成最大长度', value: 'b' },
            { text: 'request_timeout=60：单次 API 调用超时', value: 'c' },
            { text: 'temperature=0：防止随机输出', value: 'd' },
            { text: 'max_retries=3：最多重试 3 次', value: 'e' }
          ],
          answer: ['a', 'b', 'c'],
          explain: 'recursion_limit 防死循环、max_tokens 防超长生成、timeout 防卡死。这三个缺一不可。',
        },
        {
          id: 'm5fq3',
          type: 'single',
          knowledgeTag: '鉴权',
          text: '鉴权中间件为什么不直接返回 401，而是标记后让业务层判断？',
          options: [
            { text: '性能考虑', value: 'a' },
            { text: '/health 和 /docs 不需要鉴权，中间件直接拦会影响这些路由', value: 'b' },
            { text: '中间件不能返回响应', value: 'c' },
            { text: 'FastAPI 的限制', value: 'd' }
          ],
          answer: 'b',
          explain: '健康检查、文档页、公开 API 不需要鉴权。中间件只"标记"身份状态，由 get_current_user() 在需要的地方才强制。',
        },
        {
          id: 'm5fq4',
          type: 'single',
          knowledgeTag: '鉴权',
          text: '中间件 dispatch 里 finally 中调用 _current_user.reset(cv_token) 是防什么？',
          options: [
            { text: '防止内存泄漏', value: 'a' },
            { text: '防止协程池复用时上一个请求的用户身份泄漏到下一个请求', value: 'b' },
            { text: '关闭数据库连接', value: 'c' },
            { text: '清除 JWT 缓存', value: 'd' }
          ],
          answer: 'b',
          explain: 'asyncio 的协程可能被复用。不 reset 的话，下一个请求可能拿到上一个请求的 user_id——这是安全漏洞。',
        },
        {
          id: 'm5fq5',
          type: 'fill',
          knowledgeTag: '预算控制',
          text: 'LangGraph 图执行时传入什么参数防止死循环？（只填参数名）',
          hint: '在 config 字典里，限制最大节点执行步数',
          answer: ['recursion_limit', 'recursion_limit=25'],
          explain: 'config={"recursion_limit": 25}，图最多执行 25 步就强制停止。',
        }
      ]
    }
  ]
};
