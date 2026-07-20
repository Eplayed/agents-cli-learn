# 差距分析：当前项目 vs agent-service-toolkit

> 参考仓库：[JoshuaC215/agent-service-toolkit](https://github.com/JoshuaC215/agent-service-toolkit)
> 目的：把"我们已有的"和"工业级模板"做对照，列出"具体改造步骤"，便于一边读源码一边升级自己的项目。

---

## 0. 当前状态速览（2026 更新）

> 本文最初写于项目早期，下面 5 个"差距"里多数已经补齐。原文的改造步骤保留作为**学习/对照参考**，
> 但**当前真实状态**以下表为准（避免读者误以为还没做）。

| 差距 | 状态 | 在哪实现 / 说明 |
|---|---|---|
| 差距 1：Agent 注册中心 | ✅ 已完成（M3/M4） | `app/agents/registry.py` + `catalog.py`，9 种 Agent 工厂 + `GET /api/v1/agents` |
| 差距 2：协议 Schema 严格化 | 🟡 部分 | 流式事件仍是约定好的 dict（type/content/data 一致）；未做 Pydantic StreamEvent 强类型 |
| 差距 3：Checkpointer 持久化 | ✅ 已完成（M5 + M13.5） | `core/checkpointer.py`：AsyncSqliteSaver(dev) / AsyncPostgresSaver(Postgres 多机共享)，lifespan 注入 |
| 差距 4：鉴权 | ✅ 已完成（M5 + M13） | Bearer 中间件 + 多用户 JWT/bcrypt（`core/auth.py` + `core/security.py`），per-user 配额生效 |
| 差距 5：客户端 SDK | 🟡 部分 | 前端 `useStream.ts` / `useResumableStream.ts` 已封装；未做独立的 Python `AgentClient` SDK |

> 另外，项目在对标之外还补了不少工业级能力：全链路 Trace-ID、流式断线续传、Alembic 迁移、
> 安全加固（去 eval/证书校验/高危工具门禁）、生产启动校验、AI 测试引擎等（见 `LEARNING-PLAN.md` M10–M13.6）。

---

## 1. 为什么选 agent-service-toolkit 当对标？

| 选它的理由 | 说明 |
|---|---|
| **同栈** | LangGraph + FastAPI + Pydantic + 异步，和你现在用的完全一样 |
| **够工业级** | 有 Agent 注册中心、客户端 SDK、Docker Compose、内容审核、Langfuse 集成 |
| **够新** | 用了 LangGraph 1.x 的 `interrupt()` / `Command` / `Store` / `langgraph-supervisor` |
| **够小** | 不像企业级框架那么臃肿，每个文件读得完 |

---

## 2. 5 个核心差距（按优先级）

### 差距 1：Agent 注册中心（✅ 已完成，M3/M4）

> **当前状态**：已实现 `app/agents/registry.py`（`register_agent` 装饰器 + `list_agents`）
> 和 `catalog.py`（9 种 Agent 工厂），并有 `GET /api/v1/agents` 列表端点。下面是当初的改造记录，供对照学习。

#### （历史）现状
项目早期 `apps/api/app/api/v1/chat.py` 里**写死**了只调用 `SingleAgent`：
```python
# 现状：硬编码 agent
agent = SingleAgent(session_id=session.id)
async for chunk in agent.stream(request.message):
    ...
```

如果想加第二个 agent（比如 `research-assistant` / `coder-agent`），要改 chat.py、加 if/else，扩展性差。

#### 参考做法（[agent-service-toolkit/src/agents/agents.py](https://github.com/JoshuaC215/agent-service-toolkit/blob/main/src/agents/agents.py)）

```python
# 用 dataclass + 字典做注册中心
@dataclass
class Agent:
    description: str
    graph_like: AgentGraphLike  # CompiledStateGraph | Pregel | LazyLoadingAgent

agents: dict[str, Agent] = {
    "chatbot": Agent(description="A simple chatbot.", graph_like=chatbot),
    "research-assistant": Agent(...),
    "github-mcp-agent": Agent(...),  # ← MCP agent 也是注册进来的一员
}

def get_agent(agent_id: str) -> AgentGraph: ...
def get_all_agent_info() -> list[AgentInfo]: ...
```

URL 变成 `POST /agents/{agent_id}/invoke`，agent 由路径参数选。

#### 为什么这样好？
1. **加 agent 不改 router**：只要在字典里多塞一个 entry
2. **天然支持 `GET /info` 返回所有 agent 列表**：前端可下拉切换
3. **支持 `LazyLoadingAgent`**：MCP agent 可以延迟连接（启动快）

#### 改造步骤（落到你的项目）

**Step 1**：新建 `apps/api/app/agents/registry.py`
```python
from dataclasses import dataclass
from typing import Callable, Awaitable, AsyncGenerator

@dataclass
class AgentEntry:
    key: str
    description: str
    factory: Callable[[str], "BaseAgent"]  # session_id -> agent 实例

REGISTRY: dict[str, AgentEntry] = {}

def register_agent(key: str, description: str):
    def deco(factory):
        REGISTRY[key] = AgentEntry(key, description, factory)
        return factory
    return deco

def get_agent(key: str, session_id: str):
    if key not in REGISTRY:
        raise KeyError(f"Agent not found: {key}")
    return REGISTRY[key].factory(session_id)

def list_agents() -> list[dict]:
    return [{"key": e.key, "description": e.description} for e in REGISTRY.values()]
```

**Step 2**：在 `apps/api/app/agents/single/agent.py` 末尾注册
```python
from app.agents.registry import register_agent

@register_agent("default", "默认单 Agent，带天气/计算/搜索工具")
def _factory(session_id: str):
    return SingleAgent(session_id=session_id)
```

**Step 3**：改 `chat.py`
```python
@router.post("/{agent_key}/stream_ndjson")
async def chat_stream_ndjson(agent_key: str, request: ChatRequest, ...):
    agent = get_agent(agent_key, session.id)
    ...
```

**Step 4**：加 `GET /api/v1/agents` 列表端点
```python
@router.get("/agents")
async def list_agents_endpoint():
    return list_agents()
```

#### 验收
- [ ] `curl http://localhost:8000/api/v1/agents` 返回所有可用 agent
- [ ] 加一个新 agent 只需新建文件 + 加 `@register_agent` 装饰器，不改 router

---

### 差距 2：协议 Schema 严格化（🟡 部分完成）

> **当前状态**：流式事件仍是"约定好字段的 dict"（type + content/data，前后端一致，已在 M12 P0 统一工具卡片渲染），
> 但**尚未**做成 Pydantic 强类型 `StreamEvent`。若要进一步类型安全，可按下面步骤升级。

#### 现状
`chat.py` 流式事件用（约定字段的）dict：
```python
yield {"type": "text", "content": "..."}
yield {"type": "tool_calls", "data": {"name": ..., "input": ...}}
yield {"type": "done", "content": ""}
```

类型字段不统一（有的用 `content`，有的用 `data`），前端解析容易出错。

#### 参考做法（[schema.py](https://github.com/JoshuaC215/agent-service-toolkit/blob/main/src/schema/schema.py)）

```python
class ToolCall(TypedDict):
    name: str
    args: dict[str, Any]
    id: str | None
    type: NotRequired[Literal["tool_call"]]

class ChatMessage(BaseModel):
    type: Literal["human", "ai", "tool", "custom"]
    content: str
    tool_calls: list[ToolCall] = []
    tool_call_id: str | None = None
    run_id: str | None = None  # ← 关键：trace_id 贯穿
    response_metadata: dict[str, Any] = {}
    custom_data: dict[str, Any] = {}
```

**关键设计**：每条消息带 `run_id`，前端拿到就能跳到 Langfuse 看 trace。

#### 改造步骤

**Step 1**：扩展 `apps/api/app/schemas/chat.py`
```python
from typing import Literal, Any, NotRequired
from typing_extensions import TypedDict

class ToolCall(TypedDict):
    name: str
    args: dict[str, Any]
    id: str | None

class StreamEvent(BaseModel):
    """统一流式事件"""
    type: Literal["text", "tool_call", "tool_result", "interrupt", "error", "done"]
    content: str = ""
    tool_calls: list[ToolCall] = []
    tool_call_id: str | None = None
    run_id: str | None = None  # 用于关联 Langfuse trace
    metadata: dict[str, Any] = {}
```

**Step 2**：把 agent.py 里所有 `yield {...}` 改成 `yield StreamEvent(...).model_dump()`

#### 为什么这样好？
1. **类型安全**：Pydantic 自动校验，前端拿到的字段稳定
2. **可演进**：加字段不破坏旧客户端（NotRequired）
3. **OpenAPI 自动文档**：FastAPI 会把 schema 渲染到 `/docs`

---

### 差距 3：Checkpointer 持久化（✅ 已完成，M5 + M13.5）

> **当前状态**：已实现 `core/checkpointer.py`——dev 用 `AsyncSqliteSaver`，Postgres 下自动切
> `AsyncPostgresSaver`（多机共享，支持水平扩展），在 lifespan 里初始化并注入 `app.state.checkpointer`。
> `MemorySaver` 仅作为没跑 lifespan（如单测）时的回退。下面是当初的改造记录。

#### （历史）现状
项目早期：
```python
# apps/api/app/agents/single/agent.py
self.checkpointer = MemorySaver()  # 内存版，重启就丢
```

#### 参考做法（[service.py lifespan](https://github.com/JoshuaC215/agent-service-toolkit/blob/main/src/service/service.py)）

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with initialize_database() as saver, initialize_store() as store:
        if hasattr(saver, "setup"):
            await saver.setup()
        # 把 saver 注入所有 agent
        for a in get_all_agent_info():
            agent = get_agent(a.key)
            agent.checkpointer = saver
            agent.store = store
        yield
```

**关键设计**：
- 用 FastAPI lifespan 在启动时初始化一次，所有 agent 共用
- 支持 SQLite / Postgres 切换（同一个 `initialize_database()` 工厂）

#### 改造步骤

**Step 1**：装依赖
```bash
pip install langgraph-checkpoint-sqlite
```

**Step 2**：新建 `apps/api/app/core/checkpointer.py`
```python
from contextlib import asynccontextmanager
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from app.core.config import settings

@asynccontextmanager
async def initialize_checkpointer():
    if settings.DATABASE_URL.startswith("sqlite"):
        # 提取文件路径
        path = settings.DATABASE_URL.split("///")[-1]
        async with AsyncSqliteSaver.from_conn_string(path) as saver:
            yield saver
    else:
        # Postgres 走 AsyncPostgresSaver
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        async with AsyncPostgresSaver.from_conn_string(settings.DATABASE_URL) as saver:
            yield saver
```

**Step 3**：改 `apps/api/app/main.py`
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with initialize_checkpointer() as checkpointer:
        await checkpointer.setup()
        app.state.checkpointer = checkpointer  # 全局共享
        yield
```

**Step 4**：改 `SingleAgent.__init__`
```python
def __init__(self, session_id: str, checkpointer=None):
    self.checkpointer = checkpointer or MemorySaver()  # 兼容老调用
```

**Step 5**：在 chat.py 里传入
```python
agent = SingleAgent(session_id=session.id, checkpointer=request.app.state.checkpointer)
```

#### 验收
- [ ] 重启 API 后，用相同 `thread_id` 发消息能看到上一次的对话历史

---

### 差距 4：鉴权（✅ 已完成，M5 + M13）

> **当前状态**：已实现 Bearer 中间件（`core/auth.py`），并在 M13 升级为多用户 JWT + bcrypt
> （`core/security.py` + `api/v1/auth.py` 的 register/login/me），真实 user_id 打通 per-user 配额。
> 下面是当初"可选 Bearer 鉴权"的改造记录。

#### （历史）现状
项目早期所有接口都裸奔，任何人 curl 都能调你的 OpenAI key。

#### 参考做法（[service.py verify_bearer](https://github.com/JoshuaC215/agent-service-toolkit/blob/main/src/service/service.py)）

```python
def verify_bearer(http_auth: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False))):
    if not settings.AUTH_SECRET:
        return  # 没设密钥就放开（开发友好）
    if not http_auth or http_auth.credentials != settings.AUTH_SECRET.get_secret_value():
        raise HTTPException(401)

router = APIRouter(dependencies=[Depends(verify_bearer)])
```

**关键设计**：
- `AUTH_SECRET` 没设 → 不鉴权（本地开发零成本）
- 设了 → 全局生效（一行加密）
- `auto_error=False` → 自定义错误格式

#### 改造步骤

**Step 1**：`config.py` 加字段
```python
from pydantic import SecretStr

class Settings(BaseSettings):
    AUTH_SECRET: SecretStr | None = None
```

**Step 2**：新建 `apps/api/app/core/auth.py` 复制 `verify_bearer`

**Step 3**：在 `chat.py` / `team.py` 路由器加依赖
```python
router = APIRouter(dependencies=[Depends(verify_bearer)])
```

---

### 差距 5：客户端 SDK（🟡 部分完成）

> **当前状态**：前端已封装 `useStream.ts`（NDJSON）与 `useResumableStream.ts`（任务化 SSE 断线续传）。
> **尚未**提供独立的 Python `AgentClient` SDK（供 pytest/命令行复用）；若要做可按下面步骤。

#### 现状
`apps/web/src/composables/useStream.ts`（Vue 3）封装了 `fetch()` 调 NDJSON，`useResumableStream.ts` 封装了任务化 SSE。如果将来加别的前端 / 或者写测试脚本，仍可复用这些 composable。

#### 参考做法
agent-service-toolkit 有 `src/client/client.py`：
```python
class AgentClient:
    def __init__(self, base_url: str, agent: str = "default", auth_secret: str | None = None):
        ...

    async def ainvoke(self, message: str, thread_id: str | None = None) -> ChatMessage:
        ...

    async def astream(self, message: str, thread_id: str | None = None) -> AsyncGenerator[ChatMessage]:
        ...
```

任何 Python 代码（pytest / 命令行 / Streamlit）都能调用。

#### 改造步骤
**Step 1**：新建 `apps/api/app/client/__init__.py`
```python
import httpx
import json
from typing import AsyncGenerator
from app.schemas.chat import StreamEvent

class AgentClient:
    def __init__(self, base_url: str = "http://localhost:8000", agent: str = "default"):
        self.base_url = base_url
        self.agent = agent

    async def astream(self, message: str, session_id: str | None = None) -> AsyncGenerator[StreamEvent, None]:
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/v1/chat/{self.agent}/stream_ndjson",
                json={"message": message, "session_id": session_id},
                timeout=120,
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    yield StreamEvent(**json.loads(line))
```

**Step 2**：跑一遍验证
```python
async def main():
    client = AgentClient()
    async for event in client.astream("北京天气怎么样"):
        print(event.type, event.content)
```

---

## 3. 改造顺序建议（历史）

> 下面是当初规划的改造顺序；差距 1/3/4 已完成，差距 2/5 仍部分待做（见第 0 节状态速览）。

按以下顺序做，每步独立可验证：

```
1. 差距 2（Schema 严格化）→ 后续全部改造的基础
2. 差距 1（Agent 注册中心）→ 有了它才好加新 agent
3. 差距 3（Checkpointer 持久化）→ 配合 M5 一起做
4. 差距 5（客户端 SDK）→ 配合 M7 评测一起做
5. 差距 4（鉴权）→ 上线前最后做
```

---

## 4. 不参考的部分（明确放弃）

| 该项目有但你不抄 | 原因 |
|---|---|
| Streamlit 前端 | 你已有 Web UI；后续要做就上 Next.js + agent-chat-ui，不走 Streamlit |
| `langgraph-supervisor` | 你已有 Multi-Agent 4 种模式实现，足够学习 |
| LangSmith 反馈系统 | 优先用 Langfuse（自托管开源） |
| Groq Safeguard 内容审核 | 学习项目暂不需要 |

---

## 5. 阅读源码的建议路线

按这个顺序读 agent-service-toolkit，最高效：

1. `src/schema/schema.py` — **先看协议**（30 分钟）
2. `src/agents/agents.py` — Agent 注册中心（10 分钟）
3. `src/agents/research_assistant.py` — 一个真实 agent 实现（20 分钟）
4. `src/service/service.py` — FastAPI 路由 + lifespan（40 分钟）
5. `src/memory/__init__.py` — Checkpointer + Store 工厂（15 分钟）
6. `src/client/client.py` — 客户端 SDK（20 分钟）

> 跳过 `streamlit_app.py`、`bg_task_agent`、`rag_assistant`，这些是各自的进阶选修。

---

> 内容根据公开搜索结果做了改写以符合引用规范
