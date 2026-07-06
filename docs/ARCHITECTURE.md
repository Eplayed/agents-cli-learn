# 项目架构与流程图

> 6 张图覆盖项目"现状 + 未来"全貌。配色约定：
> - 🟢 **绿色 = 已完成**（M0-M4）
> - 🟡 **黄色 = 进行中**（当前里程碑）
> - 🔵 **蓝色 = 未来**（M5-M9）
> - ⚪ **灰色 = 不做**（已明确放弃）

> 所有图用 Mermaid 绘制，GitHub / VSCode 直接渲染。

---

## 📺 怎么看图（推荐顺序）

| 场景 | 用什么 |
|---|---|
| **看大图** ⭐ 推荐 | 浏览器打开 [diagrams.html](./diagrams.html) — 全屏 + 滚轮缩放 + 拖拽 + 一键导出 SVG/PNG |
| 快速浏览 | VSCode 打开本文件，按 `Cmd+Shift+V` 预览 |
| 临时看一张 | 复制 mermaid 代码到 [mermaid.live](https://mermaid.live) |
| GitHub 上看 | 直接打开本文件，GitHub 自动渲染（字稍小） |

**启动 diagrams.html：**

```bash
# 在项目根目录起一个本地静态服务（任选其一）
python3 -m http.server 9000
# 或 npx serve .

# 浏览器访问
open http://localhost:9000/docs/diagrams.html
```

---

## 1. 整体架构总览

把整个系统按"层"拆开看，每层标注"现在有什么 / 未来加什么"。

```mermaid
%%{init: {'theme':'default', 'themeVariables': {'fontSize':'18px', 'fontFamily':'-apple-system, sans-serif'}, 'flowchart': {'nodeSpacing': 50, 'rankSpacing': 70, 'curve': 'basis'}}}%%
graph TB
    subgraph CLIENT["🌐 客户端层"]
        WEB[Web UI<br/>静态 HTML]:::done
        NEXT[Next.js Console<br/>Trace 面板/HITL UI]:::future
        SDK[Python AgentClient SDK]:::future
        CLAUDE[Claude Desktop / Cursor<br/>外部 MCP Host]:::done
    end

    subgraph EDGE["🛡️ 边界层"]
        AUTH[JWT / Bearer Auth]:::future
        RATE[Rate Limit / 限流]:::future
        CORS[CORS]:::done
    end

    subgraph API["⚡ FastAPI 服务"]
        ROUTE_CHAT["/api/v1/chat/*"]:::done
        ROUTE_TEAM["/api/v1/team/*"]:::done
        ROUTE_SESS["/api/v1/session/*"]:::done
        ROUTE_AGENTS["/api/v1/agents<br/>注册中心"]:::future
        ROUTE_EVAL["/api/v1/eval/*"]:::future
    end

    subgraph RUNTIME["🤖 Agent Runtime"]
        REG[Agent Registry<br/>注册中心]:::future
        SINGLE[SingleAgent<br/>StateGraph + ToolNode]:::done
        MULTI[MultiAgentTeam<br/>Sequential/Parallel/<br/>Supervisor/GroupChat]:::done
        BUDGET[预算控制<br/>recursion_limit/max_tokens]:::future
        HITL[HITL interrupt<br/>人工确认节点]:::future
    end

    subgraph TOOLS["🔧 工具层（MCP）"]
        MCP_W[Weather MCP Server<br/>stdio]:::current
        MCP_U[Utils MCP Server<br/>stdio]:::current
        MCP_FS[Filesystem MCP<br/>官方]:::future
        MCP_GH[GitHub MCP<br/>官方]:::future
        SKILLS[Skills Loader<br/>SKILL.md + 渐进加载]:::future
    end

    subgraph MEMORY["🧠 记忆层"]
        CKPT[Checkpoint<br/>MemorySaver→SQLite/PG]:::current
        STORE[LangGraph Store<br/>跨会话长期记忆]:::future
        VEC[pgvector 向量检索<br/>RAG]:::future
    end

    subgraph DATA["💾 数据层"]
        DB[(SQLite / PostgreSQL<br/>Sessions/Messages)]:::done
    end

    subgraph OBS["🔭 可观测层"]
        OTEL[OpenTelemetry GenAI]:::future
        LF[Langfuse 自托管]:::future
        EVAL[DeepEval 回归集]:::future
    end

    subgraph EXT["☁️ 外部"]
        LLM[OpenAI / Anthropic]:::done
        WEATHER_API[Open-Meteo API]:::done
    end

    WEB --> CORS
    NEXT --> AUTH
    SDK --> AUTH
    CORS --> ROUTE_CHAT
    AUTH --> RATE --> ROUTE_CHAT
    CLAUDE -.直连.-> MCP_W

    ROUTE_CHAT --> REG
    ROUTE_TEAM --> REG
    ROUTE_AGENTS --> REG
    REG --> SINGLE
    REG --> MULTI

    SINGLE --> BUDGET
    SINGLE --> HITL
    SINGLE --> MCP_W
    SINGLE --> MCP_U
    SINGLE -.未来.-> MCP_FS
    SINGLE -.未来.-> MCP_GH
    SINGLE --> SKILLS

    MCP_W --> WEATHER_API
    SINGLE --> LLM
    MULTI --> LLM

    SINGLE --> CKPT
    SINGLE -.未来.-> STORE
    STORE -.未来.-> VEC

    ROUTE_SESS --> DB
    CKPT --> DB

    SINGLE -.trace.-> OTEL
    OTEL -.export.-> LF
    EVAL -.读取.-> LF

    classDef done fill:#10b981,stroke:#047857,color:#fff
    classDef current fill:#fbbf24,stroke:#d97706,color:#000
    classDef future fill:#3b82f6,stroke:#1e40af,color:#fff
```

**怎么看这张图：**
- 绿色块都是你**今天已经能跑的**功能
- 黄色块是 **M4 这次刚加的**（MCP）
- 蓝色块是 **M5-M9 的目标**，按 LEARNING-PLAN.md 的优先级一个个填上去

---

## 2. 单 Agent 请求流程（含 MCP）

从用户在 Web UI 输入到看到流式输出的端到端数据流。

```mermaid
%%{init: {'theme':'default', 'themeVariables': {'fontSize':'16px'}, 'sequence': {'actorFontSize': 16, 'messageFontSize': 14, 'noteFontSize': 14, 'width': 160}}}%%
sequenceDiagram
    autonumber
    participant U as 用户
    participant UI as Web UI
    participant API as FastAPI<br/>chat.py
    participant DB as SQLite
    participant SA as SingleAgent
    participant LG as LangGraph<br/>StateGraph
    participant LLM as ChatOpenAI
    participant MCP as MCP Client<br/>(MultiServer)
    participant MCPS as MCP Server<br/>weather_server
    participant API_EXT as Open-Meteo API

    U->>UI: 输入"上海天气"
    UI->>API: POST /chat/stream_ndjson
    API->>DB: 写入 user message
    API->>SA: SingleAgent(session_id)
    Note over SA: 构造时已通过 loader<br/>从 MCP 加载工具

    API->>SA: agent.stream(message)
    SA->>LG: graph.astream_events
    LG->>LLM: 发送 messages
    LLM-->>LG: AIMessage(tool_calls=[get_weather])

    rect rgb(240, 255, 240)
        Note over LG,API_EXT: 工具调用阶段
        LG->>MCP: invoke get_weather("上海")
        MCP->>MCPS: stdio JSON-RPC call
        MCPS->>API_EXT: HTTP GET geocoding+forecast
        API_EXT-->>MCPS: 天气数据
        MCPS-->>MCP: 工具返回字符串
        MCP-->>LG: ToolMessage(content=...)

        LG-->>API: yield tool_calls 事件
        API-->>UI: NDJSON: tool_calls
        UI-->>U: 显示"正在调用 get_weather"

        LG-->>API: yield tool_result 事件
        API-->>UI: NDJSON: tool_result
        UI-->>U: 显示工具结果（折叠）
    end

    LG->>LLM: 第二轮：基于工具结果生成回答
    loop 流式 token
        LLM-->>LG: token
        LG-->>API: yield text 事件
        API-->>UI: NDJSON: text chunk
        UI-->>U: 增量渲染回答
    end

    LG-->>API: 流结束
    API->>DB: 写入 assistant message
    API-->>UI: NDJSON: done
```

**关键学习点：**
- **第 7-8 步**是 MCP 改造前后最大的变化：以前 LangGraph 直接调本进程函数，现在通过 MCP Client 走子进程
- **第 16-19 步**是流式的本质：每个 token 一个事件，UI 增量渲染
- 整个流程的事件序列稳定（可作为回归测试基准）

---

## 3. Multi-Agent 4 种协作模式对比

```mermaid
%%{init: {'theme':'default', 'themeVariables': {'fontSize':'18px'}, 'flowchart': {'nodeSpacing': 40, 'rankSpacing': 50}}}%%
flowchart LR
    subgraph SEQ["1️⃣ Sequential 顺序"]
        direction TB
        S1[Researcher] --> S2[Writer] --> S3[Reviewer]
    end

    subgraph PAR["2️⃣ Parallel 并行"]
        direction TB
        P0((START))
        P0 --> P1[Researcher]
        P0 --> P2[Writer]
        P0 --> P3[Reviewer]
        P1 --> P4((汇总))
        P2 --> P4
        P3 --> P4
    end

    subgraph SUP["3️⃣ Supervisor 主管"]
        direction TB
        SU0[Supervisor<br/>分析任务] -->|分配| SU1[Worker A]
        SU0 -->|分配| SU2[Worker B]
        SU1 --> SU3[Supervisor<br/>汇总]
        SU2 --> SU3
    end

    subgraph GC["4️⃣ GroupChat 群聊"]
        direction TB
        GC0[Manager<br/>选发言者] --> GC1[Agent A 发言]
        GC1 --> GC0
        GC0 --> GC2[Agent B 发言]
        GC2 --> GC0
        GC0 -->|说 END| GC3((结束))
    end

    classDef done fill:#10b981,stroke:#047857,color:#fff
    class S1,S2,S3,P1,P2,P3,SU0,SU1,SU2,SU3,GC0,GC1,GC2 done
```

**当前实现位置**：`apps/api/app/agents/multi/team.py`

**未来增强方向（M5 之后）**：
- 给每个 worker 加预算（max_steps）
- 用 LangGraph `Send` API 替换 `asyncio.gather`（更原生）
- 引入 `langgraph-supervisor` 库做层级 supervisor

---

## 4. MCP 集成架构（M4 重点）

放大看 MCP 这层的内部结构和数据流。

```mermaid
%%{init: {'theme':'default', 'themeVariables': {'fontSize':'18px'}, 'flowchart': {'nodeSpacing': 50, 'rankSpacing': 70}}}%%
graph LR
    subgraph AGENT_PROC["Agent 进程"]
        AGENT[SingleAgent]:::done
        LOADER[mcp_servers/loader.py<br/>get_mcp_tools]:::current
        CLIENT[MultiServerMCPClient]:::current
        CACHE[(全局 Tool 缓存)]:::current
    end

    subgraph CONFIG["配置"]
        CFG[mcp_servers/config.json]:::current
    end

    subgraph SERVERS["MCP Server 子进程"]
        WS[weather_server.py<br/>FastMCP stdio]:::current
        US[utils_server.py<br/>FastMCP stdio]:::current
        FS[Filesystem MCP<br/>官方]:::future
        GH[GitHub MCP<br/>官方]:::future
    end

    subgraph EXT["外部"]
        OM[Open-Meteo API]:::done
        LOCAL[本地文件系统]:::future
        GHAPI[GitHub API]:::future
    end

    AGENT -->|启动时| LOADER
    LOADER -->|读| CFG
    LOADER --> CLIENT
    CLIENT -->|stdio JSON-RPC<br/>spawn 子进程| WS
    CLIENT -->|stdio JSON-RPC| US
    CLIENT -.未来 stdio.-> FS
    CLIENT -.未来 http.-> GH

    LOADER --> CACHE
    AGENT -->|tool_call 时| CACHE

    WS --> OM
    FS -.未来.-> LOCAL
    GH -.未来.-> GHAPI

    classDef done fill:#10b981,stroke:#047857,color:#fff
    classDef current fill:#fbbf24,stroke:#d97706,color:#000
    classDef future fill:#3b82f6,stroke:#1e40af,color:#fff
```

**这张图回答 3 个常见疑问：**

| 疑问 | 答案 |
|---|---|
| MCP Server 什么时候启动？ | Agent 第一次构造时（`get_mcp_tools()`），子进程随之 spawn |
| 工具调用走什么协议？ | stdio + JSON-RPC（每次调用复用同一个子进程） |
| 怎么加新工具？ | 写新 server 文件 → 改 `config.json` → 重启 API |

---

## 5. 学习里程碑路线图（M0-M9）

```mermaid
%%{init: {'theme':'default', 'themeVariables': {'fontSize':'16px'}, 'gantt': {'fontSize': 14, 'sectionFontSize': 16, 'barHeight': 24}}}%%
gantt
    title 学习里程碑（不强求时间，只看顺序）
    dateFormat  YYYY-MM-DD
    axisFormat  %Y-%m
    
    section 已完成
    M0 目标收敛 + 目录重构        :done,    m0, 2026-04-01, 7d
    M1 Web 后端基础              :done,    m1, after m0, 14d
    M2 Web 前端 + 流式            :done,    m2, after m1, 7d
    M3 真实工具 + 场景能力         :done,    m3, after m2, 14d
    
    section 进行中
    M4 MCP 工具协议              :active,  m4, 2026-05-25, 14d
    
    section 必补
    M5 Checkpoint 持久化 + 预算    :         m5, after m4, 10d
    M6 OpenTelemetry + Langfuse  :         m6, after m5, 10d
    M7 DeepEval 评测体系          :         m7, after m6, 10d
    
    section 进阶
    M8 Skills 框架               :         m8, after m7, 14d
    M9 长期记忆 + RAG             :         m9, after m8, 21d
```

**依赖关系（哪个不做就阻塞下一个）：**

```mermaid
%%{init: {'theme':'default', 'themeVariables': {'fontSize':'18px'}, 'flowchart': {'nodeSpacing': 40, 'rankSpacing': 60}}}%%
graph LR
    M0[M0 目录重构]:::done --> M1[M1 后端]:::done
    M1 --> M2[M2 前端]:::done
    M2 --> M3[M3 工具]:::done
    M3 --> M4[M4 MCP]:::current
    M4 --> M5[M5 Checkpoint+预算]:::future
    M4 --> M6[M6 可观测]:::future
    M5 --> M7[M7 评测]:::future
    M6 --> M7
    M7 --> M8[M8 Skills]:::future
    M7 --> M9[M9 RAG]:::future

    classDef done fill:#10b981,stroke:#047857,color:#fff
    classDef current fill:#fbbf24,stroke:#d97706,color:#000
    classDef future fill:#3b82f6,stroke:#1e40af,color:#fff
```

**关键依赖说明：**
- **M5 + M6 解锁 M7**：没有持久化和 trace，评测就无法回放和定位失败
- **M7 是分水岭**：完成后才能放心做 M8/M9，因为有了"防回退"的保护网

---

## 6. 未来形态：完整生产级架构（M9 完成时）

这是终态目标，所有里程碑做完后系统应该长这样：

```mermaid
%%{init: {'theme':'default', 'themeVariables': {'fontSize':'17px'}, 'flowchart': {'nodeSpacing': 50, 'rankSpacing': 75}}}%%
graph TB
    subgraph CLIENT["客户端"]
        N[Next.js Console<br/>对话+Trace+Skills 管理]
        E[外部 MCP Host<br/>Claude Desktop/Cursor]
    end

    subgraph GATE["边界"]
        AUTH[JWT 鉴权]
        RATE[Rate Limit]
        TRACE_ID[X-Trace-Id 注入]
    end

    subgraph SERVICE["服务层"]
        REG[Agent Registry]
        AG1[Default Agent]
        AG2[Research Agent]
        AG3[Coder Agent]
        EVAL_API[Eval API]
        SKILL_API[Skills API]
    end

    subgraph CTRL["控制面"]
        BUDGET[预算控制器<br/>steps/tokens/time]
        HITL[HITL Manager<br/>interrupt/resume]
        SUP[Supervisor<br/>路由 agent]
    end

    subgraph RUNTIME["Runtime"]
        LG[LangGraph 1.x<br/>StateGraph]
        SKILLS_LOADER[Skills Loader<br/>渐进加载]
    end

    subgraph TOOLS["工具池"]
        LOCAL_MCP[本地 MCP Servers]
        REMOTE_MCP[远程 MCP Servers]
    end

    subgraph MEM["记忆"]
        CKPT[(AsyncPostgresSaver<br/>Checkpoint)]
        STORE[(Store<br/>跨会话记忆)]
        VEC[(pgvector<br/>语义检索)]
    end

    subgraph OBS["可观测"]
        OTEL[OTel Collector]
        LF[Langfuse]
        DEEP[DeepEval CI]
    end

    N --> AUTH --> RATE --> TRACE_ID --> REG
    E -.MCP.-> LOCAL_MCP
    
    REG --> AG1
    REG --> AG2
    REG --> AG3
    REG --> EVAL_API
    REG --> SKILL_API
    
    AG1 --> SUP
    AG2 --> SUP
    SUP --> BUDGET
    BUDGET --> HITL
    HITL --> LG
    LG --> SKILLS_LOADER
    SKILLS_LOADER --> LOCAL_MCP
    SKILLS_LOADER --> REMOTE_MCP
    
    LG --> CKPT
    LG --> STORE
    STORE --> VEC
    
    LG -.span.-> OTEL
    OTEL --> LF
    DEEP -.读 trace.-> LF
    DEEP -.回归 PR.-> EVAL_API

    style N fill:#3b82f6,color:#fff
    style E fill:#10b981,color:#fff
    style LF fill:#3b82f6,color:#fff
    style DEEP fill:#3b82f6,color:#fff
    style VEC fill:#3b82f6,color:#fff
    style STORE fill:#3b82f6,color:#fff
```

**和现状对比，最显著的变化：**
1. **agent 不再单一** → 多个 agent 通过 Registry 管理，URL 路径选择
2. **工具池可远程** → 不再绑定本地子进程，可对接生态 MCP Server
3. **每次请求带 trace_id** → 任何失败都能在 Langfuse 复现现场
4. **CI 自动跑回归** → 改 prompt / 加工具不会偷偷退化

---

## 7. 怎么用这些图？

| 场景 | 看哪张图 |
|---|---|
| 给团队/朋友介绍项目 | 图 1（整体架构） |
| 调试一次请求出了什么问题 | 图 2（请求流程） |
| 决定新功能放哪 | 图 1 + 图 6 |
| 解释 MCP 怎么集成的 | 图 4 |
| 规划下一步学什么 | 图 5（路线图） |
| Code Review 时讲解改动 | 图 1（标出改动的色块） |

---

## 8. 维护建议

**图过期是常态，但要尽量准。** 每完成一个里程碑，按以下顺序更新：

1. **图 5 路线图** — 把当前 M 从 active 改成 done
2. **图 1 整体架构** — 把对应色块从蓝色改成绿色
3. **图 6 终态架构** — 这个不动，它代表目标
4. **新增专题图** — 类似图 4 这种"放大某个子系统"，每个新里程碑写一张

> 图越简单越好。如果一张图超过 30 个节点，就拆。

---

> 内容根据公开搜索结果做了改写以符合引用规范


---

## 9. Agent Harness 七层模型映射

> 参考 [AgentGuide](https://github.com/adongwanai/AgentGuide) 的 Harness Engineering 体系。
> "模型是大脑，Harness 是身体。Claude Code 90% 的代码是 Harness。"

本项目各层对应实现：

| 层 | 职责 | 本项目实现 | 文件 |
|---|---|---|---|
| **L1 模型层** | Provider 抽象 + 多模型切换 | ✅ ChatOpenAI + AVAILABLE_MODELS + UI 下拉 | `config.py` + `agent.py` |
| **L2 循环层** | Agent Loop / interrupt / resume | ✅ LangGraph StateGraph + tools_condition 循环 | `agent.py::_build_graph` |
| **L3 工具层** | Tools / Skills / MCP | ✅ MCP Servers（stdio+http）+ config 配置化 | `mcp_servers/` |
| **L4 记忆层** | Checkpoint / Vector Store | ✅ AsyncSqliteSaver（checkpoints.db）| `core/checkpointer.py` |
| **L5 人格层** | System Prompt / Policy | ✅ SystemMessage 在 stream() 里定义 | `agent.py::stream` |
| **L6 通道层** | CLI / Web / IM | ✅ Web UI（Vue 3 + NDJSON 流式）| `apps/web/src/`（构建产物 `dist/` 由 FastAPI 在 `/ui` 托管） |
| **L7 可靠性层** | Timeout / Retry / Cost Guard / Permission | ✅ recursion_limit + max_tokens + timeout + auth | `agent.py` + `core/auth.py` |

### 尚未实现（未来里程碑）

| 层 | 缺失能力 | 计划 |
|---|---|---|
| L4 | 向量检索（长期记忆） | M9 |
| L7 | OpenTelemetry trace | M6 |
| L7 | 评测回归 CI | M7 |
| L3 | Skills 渐进加载 | M8 |
