// M1 — Agent Service 后端：从 0 搭建一个能跑的 FastAPI Agent 服务

export default {
  id: 'M1',
  topic: 'Agent Service',
  title: '从 0 搭建 Agent 服务',
  subtitle: 'FastAPI + 异步 SQLAlchemy + Pydantic + lifespan，一步步建起后端',

  stages: [
    // ============ Stage 1: 故事 ============
    {
      kind: 'story',
      title: '为什么 Agent 必须 Service 化？',
      content: `
        <p>M0 学完后你也许会想：<strong>我已经能跑 Agent 了，写个 Python 脚本不就完了？</strong></p>

        <p>本地玩可以，真正用起来你会立刻撞墙：</p>

        <div class="story-box">
          😩 <strong>从"脚本"到"产品"会遇到什么？</strong>
          <ul>
            <li>朋友说：能不能给我用？<br>→ 你得把脚本部署成 HTTP 服务</li>
            <li>三个人同时用：<br>→ 你得处理并发、隔离每个人的对话</li>
            <li>用户中途关浏览器又回来：<br>→ 你得持久化对话历史</li>
            <li>前端要实时显示打字效果：<br>→ 你得支持流式输出</li>
          </ul>
        </div>

        <p>这就是为什么所有现代 Agent 项目都用 HTTP 服务包装：
        <strong>FastAPI</strong>（Python）/ <strong>Hono</strong>（TS）/ <strong>Axum</strong>（Rust）。</p>

        <p>这一关，你会理解每个组件的"为什么"，并对照看你项目里的真实代码。</p>

        <div class="story-box">
          🎯 <strong>本关你将掌握：</strong>
          <ul>
            <li>FastAPI 的核心三件套（路由/中间件/lifespan）</li>
            <li>为什么 LLM 调用必须 async/await</li>
            <li>依赖注入怎么解决"每请求独立资源"</li>
            <li>Pydantic 怎么把"Schema"变成"协议"</li>
            <li>SQLAlchemy 异步怎么处理并发 DB 写入</li>
          </ul>
        </div>
      `,
    },

    // ============ Stage 2: 概念 - Service 整体结构 ============
    {
      kind: 'concept',
      title: 'Agent Service 的标准结构',
      content: `
        <h3>📌 行业共识的 5 层架构</h3>
        <p>不管用什么语言/框架，现代 Agent 服务都长这个样：</p>

        <div class="layer-stack">
          <div class="layer top">
            <strong>1. HTTP 路由层</strong>（鉴权 / 限流 / CORS / Schema 校验）
          </div>
          <div class="layer">
            <strong>2. Agent Runtime 层</strong>（LangGraph / OpenAI Agents SDK）
          </div>
          <div class="layer mid">
            <strong>3. 状态层</strong>（Checkpoint / 业务 DB / 向量库）
          </div>
          <div class="layer">
            <strong>4. 工具层</strong>（MCP / 内部工具 / 外部 API）
          </div>
          <div class="layer bot">
            <strong>5. 可观测层</strong>（Trace / Metrics / Logs）
          </div>
        </div>

        <h3>📌 核心设计原则</h3>
        <table class="compare-table">
          <thead><tr><th>原则</th><th>解决什么问题</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>异步 async/await</strong></td>
              <td>LLM 调用是 I/O 等待，单 worker 同时处理上千个请求</td>
            </tr>
            <tr>
              <td><strong>每请求隔离</strong></td>
              <td>DB session、checkpoint thread_id 都按请求独立，避免串数据</td>
            </tr>
            <tr>
              <td><strong>Schema 即协议</strong></td>
              <td>Pydantic / Zod 把请求/响应类型固化，前后端不打架</td>
            </tr>
            <tr>
              <td><strong>lifespan 生命周期</strong></td>
              <td>启动时一次性初始化（DB / MCP / Saver），关闭时清理</td>
            </tr>
          </tbody>
        </table>

        <div class="callout">
          💡 <strong>记住</strong>：FastAPI 不是"Python Web 框架"那么简单。
          它是一组针对"异步服务 + Schema 驱动 + 自动文档"优化的工具集，
          而这恰好是 Agent 服务最需要的东西。
        </div>
      `,
    },

    // ============ Stage 3: 项目代码 - main.py ============
    {
      kind: 'build',
      title: '搭建 Step 1：FastAPI 主入口',
      content: `
        <p>打开你项目的 <code>apps/api/app/main.py</code>：</p>

        <pre data-lang="python"><code>from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.api.v1 import chat, team, session

# 1️⃣ 生命周期钩子
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting agents-cli-learn...")
    await init_db()                    # 启动时建库表
    print("Database initialized")
    yield                              # 应用运行中
    print("Shutting down...")          # 关闭时清理

# 2️⃣ 创建 FastAPI 实例
app = FastAPI(
    title="agents-cli-learn",
    version="1.0.0",
    lifespan=lifespan,
)

# 3️⃣ CORS 中间件（让浏览器跨域调）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4️⃣ 路由分层挂载
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Single Agent"])
app.include_router(team.router, prefix="/api/v1/team", tags=["Multi-Agent"])
app.include_router(session.router, prefix="/api/v1/session", tags=["Session"])
</code></pre>

        <h3>逐部分解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ lifespan</strong>：这是 <span class="hl">FastAPI 0.95+ 推荐写法</span>，
            替代旧的 @app.on_event("startup")。
            <ul>
              <li><code>yield</code> <strong>之前</strong>的代码：进程启动时执行一次</li>
              <li><code>yield</code> <strong>之后</strong>的代码：进程关闭时执行一次</li>
              <li>注意：<strong>不是每请求执行</strong>，是进程级</li>
            </ul>
          </div>
          <div class="line">
            <strong>2️⃣ FastAPI 实例</strong>：<code>title</code> / <code>version</code> 会自动出现在
            <code>/docs</code> 的 Swagger UI。把 lifespan 传进去，启动时就会自动调。
          </div>
          <div class="line">
            <strong>3️⃣ CORS</strong>：浏览器同源策略防止跨站请求。开发时前端在 :3000，后端在 :8000，
            必须 CORS 才能调通。<span class="muted">生产环境要把 allow_origins 改成具体白名单</span>。
          </div>
          <div class="line">
            <strong>4️⃣ 路由分层</strong>：<span class="hl">关键设计</span>——
            把 chat / team / session 拆到独立文件里，main.py 只负责挂载。
            <ul>
              <li>看名字就知道改哪</li>
              <li>多人协作不冲突</li>
              <li>测试时可以单独 mount 某个 router</li>
            </ul>
          </div>
        </div>

        <div class="callout">
          🔍 <strong>试一下</strong>：<code>npm run dev</code> 启动后访问 <code>http://localhost:8000/docs</code>，
          你会看到所有 API 自动生成的交互文档。这是 FastAPI 最大的甜点之一。
        </div>
      `,
    },

    // ============ Stage 4: 项目代码 - config.py ============
    {
      kind: 'build',
      title: '搭建 Step 2：配置中心',
      content: `
        <p>看 <code>apps/api/app/core/config.py</code>：</p>

        <pre data-lang="python"><code>from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    APP_NAME: str = "agents-cli-learn"
    DEBUG: bool = True
    DATABASE_URL: str = "sqlite+aiosqlite:///./agents_cli_learn.db"

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    AVAILABLE_MODELS: str = "gpt-4o-mini,gpt-4o,gpt-4.1-mini"

    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:8080"]

    class Config:
        # 配置文件查找顺序：优先级从高到低
        env_file = (".env", "../../.env", "../../.env.dev")
        case_sensitive = True

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
</code></pre>

        <h3>这段代码的关键设计</h3>

        <div class="code-explain">
          <div class="line">
            <strong>BaseSettings</strong>：Pydantic Settings 的核心类，
            <span class="hl">自动从环境变量读配置</span>，并做类型校验。
            写 <code>OPENAI_API_KEY: str = ""</code> 等于：
            <ul>
              <li>从 <code>OPENAI_API_KEY</code> 环境变量读</li>
              <li>找不到就用默认值 <code>""</code></li>
              <li>必须是 str 类型，否则启动报错</li>
            </ul>
          </div>
          <div class="line">
            <strong>env_file 多文件链</strong>：你项目允许在
            <code>apps/api/.env</code>、项目根 <code>.env</code>、项目根 <code>.env.dev</code> 任一处配置。
            前后端共享同一份 <code>.env.dev</code> 是常见做法。
          </div>
          <div class="line">
            <strong>@lru_cache()</strong>：<span class="hl">关键性能优化</span>——
            settings 只创建一次。否则每次 <code>get_settings()</code> 都会重新解析所有环境变量。
          </div>
          <div class="line">
            <strong>module-level singleton</strong>：<code>settings = get_settings()</code> 在 import 时就执行，
            后续 <code>from app.core.config import settings</code> 拿到的都是同一个实例。
          </div>
        </div>

        <h3>📂 你需要创建的 .env.dev</h3>
        <pre><code>OPENAI_API_KEY=sk-your-real-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini</code></pre>

        <div class="callout">
          🛡️ <strong>安全提示</strong>：<code>.env.dev</code> <strong>绝对不能</strong>提交到 Git。
          检查 <code>.gitignore</code> 是否包含 <code>.env*</code>。
        </div>
      `,
    },

    // ============ Stage 5: Mini-Quiz ============
    {
      kind: 'mini-quiz',
      title: '小测：检查 FastAPI 基础',
      questions: [
        {
          id: 'm1s5q1',
          type: 'single',
          knowledgeTag: '生命周期',
          text: 'lifespan 中 yield 之前和之后的代码分别什么时候执行？',
          options: [
            { text: 'yield 前后都是每次请求执行一次', value: 'a' },
            { text: 'yield 前进程启动时执行一次；yield 后进程关闭时执行一次', value: 'b' },
            { text: 'yield 前每秒执行一次心跳', value: 'c' },
            { text: 'yield 前是同步代码，yield 后是异步代码' , value: 'd' }
          ],
          answer: 'b',
          explain: 'lifespan 是进程级（启动 + 关闭各一次），不是请求级。每请求触发的是依赖注入。',
        },
        {
          id: 'm1s5q2',
          type: 'single',
          knowledgeTag: 'Pydantic Settings',
          text: '为什么用 @lru_cache() 装饰 get_settings()？',
          options: [
            { text: '让配置不可修改', value: 'a' },
            { text: '让 settings 只创建一次，避免每次都重新解析环境变量', value: 'b' },
            { text: '加密 OPENAI_API_KEY', value: 'c' },
            { text: '让配置自动热重载' , value: 'd' }
          ],
          answer: 'b',
          explain: '配置读取/解析是有 IO 成本的（读 .env 文件、类型转换）。lru_cache 让结果只算一次，全局共享。',
        }
      ]
    },

    // ============ Stage 6: 概念 - 异步 + 依赖注入 ============
    {
      kind: 'concept',
      title: '异步与依赖注入：Agent 服务的两根支柱',
      content: `
        <h3>📌 为什么 LLM 调用必须 async？</h3>

        <p>LLM 调用是<strong>典型的 I/O 等待</strong>：</p>
        <ul>
          <li>HTTP 请求发出去 → <span class="muted">等 OpenAI 响应（5-30 秒）</span> → 拿回结果</li>
          <li>等待期间 CPU 是<strong>空闲</strong>的</li>
        </ul>

        <p>对比同步 vs 异步：</p>

        <table class="compare-table">
          <thead><tr><th></th><th>同步 (sync)</th><th>异步 (async)</th></tr></thead>
          <tbody>
            <tr>
              <td>等待期间 worker 干嘛？</td>
              <td>呆呆站着</td>
              <td>切去处理别的请求</td>
            </tr>
            <tr>
              <td>1 个 worker 同时能处理多少 LLM 请求？</td>
              <td>1 个</td>
              <td>成百上千个</td>
            </tr>
            <tr>
              <td>实现难度</td>
              <td>简单</td>
              <td>需要 await 关键字</td>
            </tr>
          </tbody>
        </table>

        <p>这就是为什么你项目里所有 LLM 调用都是 <code>await llm.ainvoke()</code> 而不是 <code>llm.invoke()</code>。</p>

        <h3>📌 依赖注入：每请求独立资源</h3>

        <p>FastAPI 的 <code>Depends</code> 机制：</p>

        <pre data-lang="python"><code># 定义"工厂"
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# 路由签名声明依赖
@router.post("/send")
async def chat_send(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),  # ← 这里
):
    db.add(...)
    await db.commit()
</code></pre>

        <p>FastAPI 在每次请求时<strong>自动</strong>：</p>
        <ol>
          <li>调用 <code>get_db()</code></li>
          <li>把 <code>yield</code> 出来的 session 注入给路由函数</li>
          <li>请求结束后执行 finally，关闭 session</li>
        </ol>

        <div class="callout">
          💡 这等于<strong>"每请求独立资源 + 自动清理"</strong>，避免你手动写 try/finally。
          NestJS（TS）、Spring（Java）的 DI 机制本质相同。
        </div>

        <h3>📌 Schema 即协议：Pydantic 校验</h3>

        <pre data-lang="python"><code>class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    model: Optional[str] = None
    stream: bool = True
</code></pre>

        <p>当前端 POST 一个 <code>{"message": ""}</code>：</p>
        <ul>
          <li>Pydantic 自动检测 <code>min_length=1</code> 失败</li>
          <li><span class="hl">直接返回 422 错误，路由函数根本不会被调用</span></li>
          <li>错误信息自动告诉前端"哪个字段哪里错了"</li>
        </ul>

        <div class="callout">
          🎯 这就是"Schema 即协议"的精髓：<strong>把无效输入挡在业务逻辑之外</strong>，
          后端代码永远拿到的都是合法数据。
        </div>
      `,
    },

    // ============ Stage 7: 项目代码 - DB & Schema ============
    {
      kind: 'build',
      title: '搭建 Step 3：DB 和 Schema',
      content: `
        <p>看 <code>apps/api/app/core/database.py</code>：</p>

        <pre data-lang="python"><code>from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
)
from sqlalchemy.orm import declarative_base
from app.core.config import settings

# 1️⃣ 异步引擎
engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)

# 2️⃣ Session 工厂
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # 关键：commit 后对象仍可访问
)

# 3️⃣ ORM 基类
Base = declarative_base()

# 4️⃣ lifespan 调用：建表
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# 5️⃣ 依赖注入工厂
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
</code></pre>

        <h3>逐部分解读</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ create_async_engine</strong>：异步版的 SQLAlchemy 引擎。
            <code>sqlite+aiosqlite</code> 中的 <code>+aiosqlite</code> 表示用异步驱动。
            生产换 Postgres 就是 <code>postgresql+asyncpg</code>。
          </div>
          <div class="line">
            <strong>2️⃣ async_sessionmaker</strong>：创建 AsyncSession 的工厂。
            <span class="hl">expire_on_commit=False</span> 很关键——SQLAlchemy 默认 commit 后对象会过期，
            访问任何字段都触发新查询。在 async 环境这会变成"协程外访问数据库"导致崩溃。
          </div>
          <div class="line">
            <strong>3️⃣ Base</strong>：所有 ORM 模型的基类。<code>app/models/models.py</code> 里
            <code>class Session(Base)</code> 就靠它注册到 metadata。
          </div>
          <div class="line">
            <strong>4️⃣ init_db</strong>：lifespan 启动时调用，
            <code>create_all</code> 会自动建出所有继承了 Base 的表。
            <span class="muted">生产环境要换 Alembic 做 schema 迁移。</span>
          </div>
          <div class="line">
            <strong>5️⃣ get_db</strong>：依赖注入工厂。每个请求一个独立 session，
            <code>finally</code> 保证一定会关闭。
          </div>
        </div>

        <h3>📂 数据模型 (apps/api/app/models/models.py)</h3>
        <pre data-lang="python"><code>class Session(Base):
    __tablename__ = "sessions"
    id = Column(String(64), primary_key=True,
                default=lambda: f"sess_{uuid.uuid4().hex[:16]}")
    name = Column(String(200), default="New Session")
    mode = Column(String(20), default="single")
    message_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    messages = relationship("Message", back_populates="session",
                            cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    id = Column(String(64), primary_key=True, ...)
    session_id = Column(String(64), ForeignKey("sessions.id"))
    role = Column(String(20))    # user / assistant / system
    content = Column(Text)
    tool_calls = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
</code></pre>

        <div class="callout">
          🔍 <strong>注意 cascade="all, delete-orphan"</strong>：删除 Session 时，
          它的所有 Message 也会被自动删除。这是常见的设计，避免孤儿数据。
        </div>
      `,
    },

    // ============ Stage 8: Mini-Quiz (DB) ============
    {
      kind: 'mini-quiz',
      title: '小测：DB 与依赖注入',
      questions: [
        {
          id: 'm1s8q1',
          type: 'single',
          knowledgeTag: '异步 DB',
          text: 'SQLAlchemy 的 <code>expire_on_commit=False</code> 在 async 环境下为什么关键？',
          options: [
            { text: '让查询更快', value: 'a' },
            { text: '默认 commit 后对象过期，访问字段会触发新查询；在 async 环境这会导致"协程外访问 DB"崩溃', value: 'b' },
            { text: '防止 SQL 注入', value: 'c' },
            { text: '让 ORM 支持 JSON 字段' , value: 'd' }
          ],
          answer: 'b',
          explain: 'SQLAlchemy 默认 commit 后标记对象为"过期"，下次访问属性会隐式发 SQL。在 async 环境这个隐式查询会在错误的协程上下文执行。',
          deeper: '这是 async SQLAlchemy 最常见的坑之一。设 expire_on_commit=False 让对象 commit 后仍可安全访问。'
        },
        {
          id: 'm1s8q2',
          type: 'single',
          knowledgeTag: '设计模式',
          text: '为什么 chat.py 里"用户消息先落库，再调 Agent"？如果反过来会怎样？',
          options: [
            { text: '没区别，顺序不重要', value: 'a' },
            { text: '先落库 = 就算 Agent 调用失败崩溃，DB 里也能看到"用户问了什么"（日志先行原则）', value: 'b' },
            { text: '为了让 Agent 能读到用户消息', value: 'c' },
            { text: '数据库要求必须先写' , value: 'd' }
          ],
          answer: 'b',
          explain: '日志先行（Write-Ahead）是可靠系统的基本原则。先记录"发生了什么"，再执行"可能失败的操作"。',
          deeper: '同理：支付系统先记录订单再扣款，消息队列先持久化再投递。'
        }
      ]
    },

    // ============ Stage 9: 项目代码 - chat.py ============
    {
      kind: 'build',
      title: '搭建 Step 4：第一个 Agent 路由',
      content: `
        <p>看 <code>apps/api/app/api/v1/chat.py</code> 的核心部分：</p>

        <pre data-lang="python"><code>from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.models.models import Session, Message
from app.agents.single.agent import SingleAgent

router = APIRouter()  # 在 main.py 里 include 进来

@router.post("/send")
async def chat_send(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    # 1️⃣ 创建/复用会话
    session, _ = await get_or_create_session(request.session_id, db)

    # 2️⃣ 用户消息落库
    user_msg = Message(
        session_id=session.id,
        role="user",
        content=request.message,
    )
    db.add(user_msg)
    await db.commit()

    # 3️⃣ 调 Agent
    agent = SingleAgent(session_id=session.id, model=request.model)
    full_response = ""
    async for chunk in agent.stream(request.message):
        if chunk["type"] == "text":
            full_response += chunk.get("content", "")

    # 4️⃣ 助手消息落库
    agent_msg = Message(
        session_id=session.id,
        role="assistant",
        content=full_response,
    )
    db.add(agent_msg)
    session.message_count += 2
    await db.commit()

    return ChatResponse(
        session_id=session.id,
        message_id=agent_msg.id,
        content=full_response,
        created_at=agent_msg.created_at,
    )
</code></pre>

        <h3>这一段做了 4 件事</h3>

        <div class="code-explain">
          <div class="line">
            <strong>1️⃣ get_or_create_session</strong>：
            <ul>
              <li>请求带了 session_id → 复用</li>
              <li>没带或找不到 → 创建新的</li>
            </ul>
            这让前端可以"继续上次对话"。
          </div>
          <div class="line">
            <strong>2️⃣ 用户消息先落库</strong>：<span class="hl">关键设计</span>——
            就算后续 LLM 调用失败崩溃，DB 里也能看到"用户问了什么"。
            日志先行原则。
          </div>
          <div class="line">
            <strong>3️⃣ Agent 调用</strong>：注意 <code>SingleAgent</code> 是按请求 new 的，
            但 LangGraph 的 checkpointer 是<strong>模块级单例</strong>（M5 改造），
            所以同一 session_id 跨请求能续上历史。
          </div>
          <div class="line">
            <strong>4️⃣ 助手消息落库</strong>：等 Agent 全部生成完，把完整回答存到 DB。
            注意 <code>message_count += 2</code>（用户 + 助手各 1 条）。
          </div>
        </div>

        <h3>📂 ChatRequest Schema (apps/api/app/schemas/chat.py)</h3>
        <pre data-lang="python"><code>class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    model: Optional[str] = None
    stream: bool = True
</code></pre>

        <div class="callout">
          🎯 <strong>到这里，你已经能跑通最简 Agent 服务了</strong>：
          前端 POST 一句话 → 进 Agent → 回一段话 → 落库。
          但这还不够好用——用户体验糟糕的地方在哪？
          <strong>等待整段生成完才返回</strong>。下一关 M2 就解决这个：流式协议。
        </div>
      `,
    },

    // ============ Stage 10: Final Quiz ============
    {
      kind: 'final-quiz',
      title: '通关测验：M1 后端搭建',
      passLine: 0.8,
      questions: [
        {
          id: 'm1fq1',
          type: 'single',
          knowledgeTag: '异步并发',
          text: '为什么 Agent 的 LLM 调用必须用 async/await？',
          options: [
            { text: 'LLM 只支持异步 SDK', value: 'a' },
            { text: 'async 比 sync 快', value: 'b' },
            { text: 'LLM 调用是 I/O 等待，同步会让 worker 占用，并发上不去', value: 'c' },
            { text: 'FastAPI 不支持同步' , value: 'd' }
          ],
          answer: 'c',
          explain: 'LLM 等待几秒到几十秒是常态。异步让单 worker 同时处理上千个等待中的请求。',
        },
        {
          id: 'm1fq2',
          type: 'single',
          knowledgeTag: '依赖注入',
          text: '路由签名 <code>db: AsyncSession = Depends(get_db)</code> 实际做了什么？',
          options: [
            { text: '类型注解，仅 IDE 提示', value: 'a' },
            { text: '应用启动时调用一次，所有请求共享同一个 session', value: 'b' },
            { text: '每次请求调用 get_db()，把 yield 出的 session 注入；请求结束 finally 关闭', value: 'c' },
            { text: '懒加载，访问时才创建' , value: 'd' }
          ],
          answer: 'c',
          explain: '依赖注入 + yield = 每请求独立资源 + 自动清理。',
        },
        {
          id: 'm1fq3',
          type: 'single',
          knowledgeTag: 'Schema 协议',
          text: '前端 POST 时 message 是空字符串，会发生什么？',
          options: [
            { text: '正常进入路由函数', value: 'a' },
            { text: 'Pydantic 校验失败（min_length=1），返回 422，路由函数根本不会被调用', value: 'b' },
            { text: '500 内部错误', value: 'c' },
            { text: '请求被丢弃' , value: 'd' }
          ],
          answer: 'b',
          explain: 'Pydantic 在路由函数被调用之前完成校验。这是"Schema 即协议"的核心。',
        },
        {
          id: 'm1fq4',
          type: 'multi',
          knowledgeTag: '生命周期',
          text: '关于 lifespan，下列哪些说法正确？（多选）',
          options: [
            { text: 'yield 之前的代码进程启动时执行一次', value: 'a' },
            { text: '每次 HTTP 请求都触发 lifespan', value: 'b' },
            { text: 'yield 之后的代码在进程关闭时执行', value: 'c' },
            { text: '适合放：建表、连 MCP、初始化 Checkpointer', value: 'd' }
          ],
          answer: ['a', 'c', 'd'],
          explain: 'lifespan 是进程级，不是请求级。',
        },
        {
          id: 'm1fq5',
          type: 'order',
          knowledgeTag: 'Agent Service',
          text: '把 FastAPI 处理 POST /chat/send 的步骤按顺序排好',
          items: [
            { id: 'a', text: 'Pydantic 根据 ChatRequest 校验请求 body' },
            { id: 'b', text: 'Depends(get_db) 注入新的 AsyncSession' },
            { id: 'c', text: '路由函数 chat_send 执行业务（调 Agent / 写 DB）' },
            { id: 'd', text: '请求结束，get_db 的 finally 关闭 session' }
          ],
          answer: ['a', 'b', 'c', 'd'],
          explain: '校验 → 依赖注入 → 业务 → 清理。这是 FastAPI 标准请求生命周期。',
        },
        {
          id: 'm1fq6',
          type: 'fill',
          knowledgeTag: '生命周期',
          text: '本项目 lifespan 在 yield 之前调用了什么函数建库表？（只填函数名）',
          hint: '提示：在 app/core/database.py 中，用 Base.metadata.create_all',
          answer: ['init_db'],
          explain: 'init_db() 用 SQLAlchemy 自动创建所有 ORM 表。生产用 Alembic 迁移。',
        }
      ]
    }
  ],
};
