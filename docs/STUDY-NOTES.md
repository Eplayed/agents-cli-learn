# 学习笔记（M0 → M4）

> 这是你已完成内容的浓缩复盘。每一关包括：学习目标、核心概念、代码定位、自检问题。
> 配合在聊天里和我互动答题使用，错了就回来翻这份笔记。

---

## 🎯 学习方法（先看这一段）

**遗忘曲线**：学过的东西如果不用，1 天后只记得 30%，1 周后只剩 10%。

**对抗方法（本笔记的核心）：**
1. **主动回忆**：合上书，能讲出来才算懂
2. **代码定位**：能说出"这个概念在我项目的哪个文件第几行"
3. **解释动机**：能回答"为什么这样设计而不是另一种"

每关读完后，**先试着不看笔记回答问题**，回答不上来再翻回来。

---

## M0 — 项目定位与目录结构

### 学习目标
理解为什么这个项目长这样、为什么舍弃了 TS CLI、Web-only 是什么意思。

### 核心概念（3 个）

#### 1. Web-only 是什么
不再做"多通道接入"（微信/飞书/钉钉），只通过 Web UI + Web API 提供服务。原因：
- 学习项目要聚焦，避免被通道适配分散注意力
- 现代 Agent 的核心是「Runtime + 工具协议 + 可观测」，不是聊天通道

#### 2. 为什么 TS CLI 被归档
TS CLI（`archive/cli/`）是 Phase 1-2 的学习资产，验证了"LangGraph 怎么用"。但生产化能力（DB / 鉴权 / 流式协议）在 Python + FastAPI 生态更成熟，所以 M3 之后切换。

#### 3. 当前目录长什么样
```
apps/
  api/    ← Python FastAPI 后端（一切核心都在这里）
  web/    ← 静态 Web UI（HTML，无构建）
archive/
  cli/    ← 旧 TS CLI，只读保留
docs/     ← 学习文档（架构图/笔记/差距分析）
```

### 代码定位
- **入口**：`apps/api/app/main.py`
- **路由总注册**：`main.py` 里 `app.include_router(...)` 三行
- **静态 UI 提供**：`main.py` 的 `@app.get("/ui")` → `FileResponse`

### 自检问题
1. 这个项目为什么不做"接入微信"这种功能？
2. `archive/cli/` 是干什么的？还会用到吗？
3. 浏览器访问 `/ui` 后，**HTML 文件**是从哪里返回的？给出具体的代码文件名。

---

## M1 — FastAPI Web 后端基础

### 学习目标
理解 FastAPI 怎么提供 HTTP 服务、怎么连 DB、怎么做依赖注入。

### 核心概念（5 个）

#### 1. FastAPI 三件套
```python
app = FastAPI(...)                          # 应用实例
app.include_router(chat.router, prefix=...) # 挂路由
app.add_middleware(CORSMiddleware, ...)     # 中间件（CORS）
```
位置：`apps/api/app/main.py`

#### 2. 路由分层
```
/api/v1/chat/*     → app/api/v1/chat.py     单 Agent 对话
/api/v1/team/*     → app/api/v1/team.py     Multi-Agent
/api/v1/session/*  → app/api/v1/session.py  会话 CRUD
```
分层好处：每个文件职责单一，看名字就知道在哪改。

#### 3. Pydantic 校验请求
```python
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    model: Optional[str] = None
```
位置：`apps/api/app/schemas/chat.py`

**为什么用 Pydantic？** 自动校验 + 自动生成 OpenAPI 文档（访问 `/docs` 就能看到）。前端传错字段后端立刻 422，不会跑到一半才崩。

#### 4. 异步 SQLAlchemy + 依赖注入
```python
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# 用法
@router.post("/")
async def create(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    db.add(...)
    await db.commit()
```
位置：`apps/api/app/core/database.py` + `app/api/v1/session.py`

**关键**：`Depends(get_db)` 是 FastAPI 的依赖注入。每次请求自动给一个 db session，结束后自动关闭。

#### 5. lifespan 生命周期
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()   # 启动：建表
    yield
    # 关闭：清理
```
位置：`apps/api/app/main.py`

**为什么用 lifespan？** 启动时只做一次的事（建表 / 加载配置 / 连 MCP）放这里。M5 改造时 `AsyncSqliteSaver` 也会放进去。

### 代码定位

| 概念 | 文件 |
|---|---|
| FastAPI app + 路由挂载 | `apps/api/app/main.py` |
| 配置（OPENAI_API_KEY 等） | `apps/api/app/core/config.py` |
| DB 引擎 + Session 工厂 | `apps/api/app/core/database.py` |
| 数据模型（Session/Message） | `apps/api/app/models/models.py` |
| Pydantic schema | `apps/api/app/schemas/chat.py` |

### 自检问题
1. 你在 `chat.py` 路由函数签名里看到 `db: AsyncSession = Depends(get_db)`，请解释：每次 HTTP 请求来时，db 是怎么来的？请求结束后又怎么走？
2. 如果我前端 POST `/api/v1/chat/send`，body 里 `message` 字段是空字符串，会发生什么？为什么？
3. `lifespan` 的作用是什么？现在用它做了什么事？M5 还会用它做什么？

---

## M2 — Web UI + NDJSON 流式协议

### 学习目标
理解前后端怎么通过流式协议增量传输 LLM token、为什么不用 SSE 而用 NDJSON。

### 核心概念（4 个）

#### 1. 三种通信方式对比

| 方式 | media-type | 端点 | 优点 | 缺点 |
|---|---|---|---|---|
| 一次性 | application/json | `/chat/send` | 简单 | 等全部完才返回 |
| SSE | text/event-stream | `/chat/stream` | 标准 | 部分浏览器/Electron 兼容差 |
| **NDJSON** | application/x-ndjson | `/chat/stream_ndjson` | 通用、易解析 | 不是规范 |

我们**默认用 NDJSON**。

#### 2. NDJSON = 每行一个 JSON
```
{"type": "tool_calls", "data": {"name": "get_weather", "input": {"city": "上海"}}}
{"type": "tool_result", "data": {"name": "get_weather", "output": "..."}}
{"type": "text", "content": "今天上海"}
{"type": "text", "content": "天气..."}
{"type": "done", "content": ""}
```
**关键**：服务端每生成一段就 `yield`，前端读一行解析一行。

#### 3. 服务端 yield bytes
```python
async def gen():
    async for chunk in agent.stream(...):
        yield (json.dumps(chunk) + "\n").encode("utf-8")
return StreamingResponse(gen(), media_type="application/x-ndjson; charset=utf-8")
```
位置：`apps/api/app/api/v1/chat.py` 的 `chat_stream_ndjson`

#### 4. 前端 fetch + ReadableStream
```js
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // 按 \n 切分，每行 JSON.parse
}
```
位置：`apps/web/src/composables/useStream.ts` 里的 NDJSON 流式解析

### 事件类型（前端必须认识）

| type | 含义 |
|---|---|
| `text` | LLM 输出的一个 token / 一段文本 |
| `tool_calls` | 模型决定调工具，参数在 `data.input` |
| `tool_result` | 工具返回，结果在 `data.output` |
| `error` | 出错了，原因在 `content` |
| `done` | 流结束，前端可以收尾 |

### 自检问题
1. 用一句话解释：SSE 和 NDJSON 的本质区别是什么？为什么我们项目选 NDJSON？
2. 后端 `gen()` 里如果忘了在每个 chunk 后加 `\n`，前端会发生什么？
3. 前端收到 `{"type": "tool_calls", ...}` 时不应该把它显示成对话内容，而是放到一个折叠块里。这是为什么？

---

## M3 — 工具调用 + LangGraph StateGraph

### 学习目标
理解 LangGraph 的「图」抽象、tool calling 循环怎么发生、astream_events 在干什么。

### 核心概念（5 个）

#### 1. StateGraph 是状态机
```
START → agent → (有 tool_calls?) ─┬─ yes → tools → agent
                                  └─ no  → END
```
- **节点（node）**：一个能改 state 的函数
- **边（edge）**：控制流向，可以是条件边
- **state**：图运行时携带的"对话状态"，本项目用内置的 `MessagesState`

位置：`apps/api/app/agents/single/agent.py` 的 `_build_graph()`

#### 2. ToolNode + tools_condition
```python
tool_node = ToolNode(self.tools)
workflow.add_node("agent", self._agent_node)
workflow.add_node("tools", tool_node)
workflow.add_conditional_edges("agent", tools_condition)
workflow.add_edge("tools", "agent")
```
- `ToolNode`：自动执行 LLM 输出的 `tool_calls`，把结果作为 `ToolMessage` 加进 state
- `tools_condition`：内置判断：AIMessage 有 tool_calls 就走 tools，否则 END

#### 3. bind_tools 把 schema 喂给 LLM
```python
self.llm_with_tools = self.llm.bind_tools(self.tools)
```
没有 `bind_tools`，LLM 不知道你有什么工具，永远不会输出 `tool_calls`。

#### 4. astream_events 解构事件
```python
async for event in self.graph.astream_events({"messages": ...}, config=..., version="v1"):
    kind = event["event"]
    if kind == "on_chat_model_stream": ...   # token
    elif kind == "on_tool_start": ...        # 工具开始
    elif kind == "on_tool_end": ...          # 工具结束
```
位置：`apps/api/app/agents/single/agent.py` 的 `stream()` 方法

#### 5. thread_id = 对话身份证
```python
config = {"configurable": {"thread_id": thread_id}}
```
- 同一个 `thread_id` → checkpoint 帮你续上对话历史
- 不同 `thread_id` → 完全独立的会话
- 本项目把 `session_id` 当成 `thread_id` 用

### 代码定位

| 概念 | 文件 + 函数 |
|---|---|
| 图构建 | `agent.py::_build_graph` |
| agent 节点（调 LLM） | `agent.py::_agent_node` |
| 工具列表加载（MCP 优先） | `agent.py::_resolve_tools_sync` |
| 流式事件转换 | `agent.py::stream` |

### 自检问题
1. 我现在删掉 `self.llm.bind_tools(self.tools)` 这行，agent 还能跑吗？工具还会被调用吗？为什么？
2. `tools_condition` 是内置的，它怎么决定下一步走 `tools` 还是 `END`？
3. 同一个用户，两次请求传**同一个** `thread_id`，第二次请求时 LangGraph 能看到第一次的对话历史吗？前提条件是什么？

---

## M4 — MCP 协议

### 学习目标
理解 MCP 是什么、为什么不直接写 `@tool`、stdio 模式下到底发生了什么。

### 核心概念（5 个）

#### 1. MCP 是什么
**Model Context Protocol** —— Anthropic 提的工具协议标准，用一句话：**让任何 LLM 客户端能用任何 server 提供的工具**。

类比：USB-C 之于充电器。

#### 2. 三个原语
| 原语 | 作用 | 我们用了吗 |
|---|---|---|
| **Tools** | 可调用函数（带 schema） | ✅ |
| **Resources** | 可读取上下文（文件/DB 记录） | ❌ |
| **Prompts** | 可复用提示词模板 | ❌ |

#### 3. FastMCP 写 server
```python
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("Weather")

@mcp.tool()
def get_weather(city: str) -> str:
    """docstring 会作为 description 发给 LLM——必须写好"""
    ...

if __name__ == "__main__":
    mcp.run(transport="stdio")
```
位置：`apps/api/app/mcp_servers/weather_server.py`

#### 4. stdio 传输模式（最容易误解的点）
```
主进程（FastAPI）  ←── stdin/stdout ──→  weather_server 子进程
```

**关键事实（容易记错）：**
- `MultiServerMCPClient` 默认是**无状态模式**
- 每次工具调用：spawn 新子进程 → 跑工具 → 回收
- **不是「永久复用一个子进程」**
- 真要长会话/共享上下文，要显式 `async with client.session(name) as session`

位置：`apps/api/app/mcp_servers/loader.py` 的 docstring 写得很清楚

#### 5. 配置化加载
```json
{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["-m", "app.mcp_servers.weather_server"],
      "transport": "stdio"
    }
  }
}
```
**好处**：加新工具集 = 加新文件 + 改配置；agent 代码完全不动。

位置：`apps/api/app/mcp_servers/config.json`

### MCP vs LangChain `@tool` 对比

| 维度 | `@tool` | `@mcp.tool()` |
|---|---|---|
| 作用范围 | 只在自己进程 | 任何 MCP Host |
| 集成生态 | 无 | Claude Desktop / Cursor / Codex |
| 隔离性 | 同进程，崩了影响主程序 | 独立进程，崩了不影响 |
| 调试 | 普通调试器 | MCP Inspector + 普通调试器 |

### 代码定位

| 概念 | 文件 |
|---|---|
| MCP server 例子 | `mcp_servers/weather_server.py` |
| 配置 | `mcp_servers/config.json` |
| 加载器（关键缓存逻辑） | `mcp_servers/loader.py` |
| Agent 怎么用 MCP 工具 | `agents/single/agent.py::_resolve_tools_sync` |

### 自检问题
1. 我把 `weather_server.py` 里 `get_weather` 函数的 docstring 删掉，会发生什么？为什么？
2. 我说"我们的 stdio MCP server 是常驻进程，启动一次永远在那"——这句话哪里错了？
3. 我现在想加一个 `github` MCP server（查 PR、issue），需要改哪些文件？需要改 `agent.py` 吗？

---

## 通关后

M0-M4 全部答对就开始做 M5：**Checkpoint 持久化 + 预算控制**。
那时候我会带你把 `MemorySaver` 换成 `AsyncSqliteSaver`，并加上 `recursion_limit`。

---

## 答错时的复习节奏

1. 先回到这份笔记对应的 M 章节
2. 按"核心概念"的顺序再读一遍
3. 试着**不看代码**，凭印象在脑子里把相关流程跑一遍
4. 实在记不住，去 IDE 里**真的打开那个文件看一眼**
5. 回来重答错的题

记住：**记不住不是你笨，是脑子的正常机制**。重要的是触发"再次回忆"的动作，每触发一次，记忆痕迹就深一点。
