# 项目结构速览（供 AI / 新人快速理解）

> 把这个文件发给 AI 就能让它快速理解整个项目，不用贴全部代码。

## 技术栈

Python 3.13 + FastAPI + LangGraph 1.x + MCP 协议 + ChromaDB + Langfuse + Vue 3 + Vite

## 目录树 + 一行摘要

```
agents-cli-learn/
├── .github/workflows/test.yml   — CI：push/PR 自动跑 pytest
├── .env.dev                     — 环境变量（OPENAI_API_KEY 等，不提交）
├── .python-version              — Python 版本锁定 3.13
├── docker-compose.yml           — 一键部署（api + 持久化卷）
├── package.json                 — npm 脚本入口（dev/diagrams/learn）
├── LEARNING-PLAN.md             — M0-M10 学习路线 + 面试题库规划
├── README.md                    — 项目介绍 + 快速开始 + 部署 + 贡献
├── PROJECT-MAP.md               — 本文件（目录树 + 摘要）
│
├── apps/api/                    — Python FastAPI 后端（核心）
│   ├── Dockerfile               — API 容器镜像
│   ├── requirements.txt         — Python 依赖清单
│   ├── pytest.ini               — 测试配置
│   ├── app/
│   │   ├── main.py              — FastAPI 入口：lifespan 初始化 DB + Checkpoint + 路由挂载
│   │   ├── agents/
│   │   │   ├── registry.py      — Agent 注册中心：register/get_agent/list_agents
│   │   │   ├── catalog.py       — 9 种 Agent 工厂注册（M0/M3/M4×2/M5/M6/M8/M9/Full）
│   │   │   ├── single/
│   │   │   │   └── agent.py     — SingleAgent：LangGraph StateGraph + ToolNode + 流式 + 预算控制
│   │   │   └── multi/
│   │   │       └── team.py      — MultiAgentTeam：Sequential/Parallel/Supervisor/GroupChat
│   │   ├── api/v1/
│   │   ├── chat.py          — /chat/send + /stream_ndjson（核心对话 API + 运行持久化 + 幂等 + 配额）
│   │   │   ├── session.py       — 会话 CRUD + 消息历史
│   │   │   ├── team.py          — Multi-Agent API
│   │   │   ├── runs.py          — Agent 运行历史 + 事件溯源回放 + 配额查询
│   │   │   └── ai_testing.py    — AI 测试 API（/types /presets/{type} /run /history）
│   │   ├── core/
│   │   │   ├── config.py        — Pydantic Settings（API Key / 模型 / 鉴权 / Langfuse）
│   │   │   ├── database.py      — AsyncSqlAlchemy + get_db 依赖注入
│   │   │   ├── checkpointer.py  — AsyncSqliteSaver（LangGraph 对话持久化）
│   │   │   ├── auth.py          — Bearer Token 中间件 + ContextVar 协程隔离
│   │   │   ├── run_tracker.py   — Agent Run/Event 持久化（事件溯源 + 幂等）
│   │   │   ├── quota.py         — Per-user 每日 token 配额限制
│   │   │   ├── tracing.py       — Langfuse callback handler（可观测追踪，注入 trace_id metadata）
│   │   │   ├── trace.py         — 全链路 Trace-ID 中间件 + ContextVar + loguru 结构化日志（M12 P1）
│   │   │   ├── rag.py           — ChromaDB 向量检索（docs/*.md 知识库）
│   │   │   ├── skills.py        — SKILL.md 解析 + 打分匹配（词边界/CJK/top-K）+ 安装管理
│   │   │   ├── token_tracker.py — Token 消耗统计 + 费用计算
│   │   │   ├── context_compressor.py — 对话自动压缩（窗口 + 摘要）
│   │   │   ├── ai_testing.py    — AI 测试引擎（6 种类型：稳定性/多轮/RAG命中/工具调用/幻觉/越狱）
│   │   │   └── ai_testing_cases.py — 6 种测试类型的预置用例（开箱即用）
│   │   ├── mcp_servers/
│   │   │   ├── config.json      — MCP Server 注册表（加工具只改这里）
│   │   │   ├── weather_server.py — 天气查询（stdio, readOnly, openWorld）
│   │   │   ├── utils_server.py  — 计算器 + 搜索占位（stdio, readOnly）
│   │   │   ├── dangerous_server.py — 删除/转账模拟（HITL 演示, destructive）
│   │   │   ├── time_server.py   — 时间工具（HTTP transport 演示）
│   │   │   └── loader.py        — MCP 配置加载 + MultiServerMCPClient 缓存
│   │   ├── models/
│   │   │   └── models.py        — SQLAlchemy ORM（Session + Message + AgentRun + AgentEvent + TestRun）
│   │   └── schemas/
│   │       └── chat.py          — Pydantic 请求/响应 Schema
│   ├── eval/
│   │   ├── cases.jsonl          — 10 条回归评测用例
│   │   └── run_eval.py          — 评测脚本（4 种断言 + CI 返回码）
│   ├── skills/
│   │   ├── weather-advisor/SKILL.md — 天气顾问能力包（触发词：天气/洗车）
│   │   └── code-reviewer/SKILL.md  — 代码审查能力包（触发词：代码/review）
│   └── tests/                   — 52 tests
│       ├── test_health.py / test_session.py / test_chat.py
│       ├── test_agents_registry.py / test_mcp_servers.py / test_auth.py
│       ├── test_skills_match.py — Skill 匹配（词边界/CJK/排序/限量）
│       ├── test_harness_boundary.py — 架构守护：核心层不 import 业务层（M12 P1）
│       └── test_trace.py       — Trace-ID 响应头 + 入站复用（M12 P1）
│
├── apps/web/                    — Vue 3 + Vite 前端
│   ├── package.json             — 前端依赖
│   ├── vite.config.ts           — Vite 配置
│   ├── src/
│   │   ├── App.vue              — 根组件
│   │   ├── main.ts              — 入口
│   │   ├── router/index.ts      — 路由（ChatView / LogView）
│   │   ├── stores/              — Pinia 状态管理
│   │   │   ├── chat.ts          — 对话消息状态
│   │   │   ├── session.ts       — 会话列表
│   │   │   └── agent.ts         — Agent/模型选择
│   │   ├── composables/
│   │   │   ├── useStream.ts     — NDJSON 流式解析
│   │   │   ├── useApi.ts        — API 请求封装
│   │   │   └── toolDisplay.ts   — 工具名人话翻译映射（M12 P0，未知工具 fallback 原名）
│   │   ├── components/
│   │   │   ├── ChatMessage.vue  — 消息气泡（Markdown 渲染）
│   │   │   ├── ToolCallBlock.vue — 工具调用卡片（M12 P0：执行中→完成状态化 + 实时耗时 + 中文名）
│   │   │   ├── TokenStats.vue   — Token 消耗面板
│   │   │   ├── AgentSelector.vue — Agent 模式切换
│   │   │   ├── ModelSelector.vue — 模型选择
│   │   │   ├── SessionList.vue  — 会话列表
│   │   │   └── TypingIndicator.vue — 等待动画
│   │   └── views/
│   │       ├── ChatView.vue     — 主对话页（流式+图片+反馈+字符计数）
│   │       ├── SkillsView.vue   — Skill 商店（在线搜索/已安装/本地）
│   │       ├── TestingView.vue  — AI 测试页（6 类型/JSON 编辑/结果详情/历史）
│   │       └── LogView.vue      — 日志面板
│   └── dist/                    — Vue 构建产物（提交进 git，FastAPI 在 /ui 托管）
│
├── docs/                        — 文档 + GitHub Pages 站点
│   ├── index.html               — Pages 门户首页
│   ├── .nojekyll                — 禁用 Jekyll（保护 _ 开头文件）
│   ├── diagrams.html            — 架构图浏览器查看器
│   ├── ARCHITECTURE.md          — 6 张 Mermaid 架构图 + Harness 七层映射
│   ├── GAP-ANALYSIS.md          — 对标 agent-service-toolkit 差距分析
│   ├── AI-TESTING.md            — AI 测试原理详解（6 类型 + 断言方法论 + API/UI 用法）
│   ├── DEERFLOW-NOTES.md        — DeerFlow 对照学习笔记（M12，独立 clone 在 deer-flow-lab/，不进 git）
│   ├── MCP-INTEGRATION.md       — M4 MCP 集成实施记录 + annotations 最佳实践
│   ├── RUNNING.md               — 本地运行手册
│   ├── DEPLOYMENT.md            — GitHub Pages 部署指南
│   ├── STUDY-NOTES.md           — M0-M4 学习笔记
│   ├── interview/               — 面试题系统学习（Vue 3 CDN 组件化）
│   │   ├── index.html           — 入口（importmap + Vue ESM）
│   │   ├── css/styles.css       — 样式（复用门户设计变量）
│   │   └── js/                  — 6 模块 50+ 题 + 真实代码讲解（data/ 已入库）
│   └── learn-game/              — 交互式学习闯关游戏
│       ├── index.html           — 游戏入口
│       ├── css/styles.css       — 全部样式
│       ├── data/               — ⚠️ gitignore 用 /data/（根锚定）避免误伤
│       │   ├── levels.js        — 关卡注册中心（10 学习关卡 + 5 面试题库）
│       │   ├── m0.js ~ m9.js    — 10 个学习关卡
│       │   ├── interview-agent.js       — 面试题：Agent 核心（15 题）
│       │   ├── interview-advanced.js    — 面试题：进阶（13 题）
│       │   ├── interview-engineering.js — 面试题：工程深入（12 题）
│       │   ├── interview-realbugs.js    — 面试题：真实踩坑（5 题）
│       │   ├── interview-runtime.js     — 面试题：生产 Runtime（6 题）
│       │   ├── interview-testing.js     — 面试题：AI 测试原理与实践（8 题）
│       │   └── techFlows.js     — 通关后技术流程图数据
│       └── js/                  — ES Module 模块化 JS
│           ├── app.js / router.js / store.js / utils.js
│           ├── components/header.js
│           └── views/ + views/stages/  — 页面 + stage 组件
│
└── archive/cli/                 — 旧 TS CLI 归档（只读保留）
```

## Agent 模式一览（9 种）

| Key | 名称 | 能力 |
|---|---|---|
| basic-chatbot | M0 · 基础对话 | 纯 LLM 无工具 |
| tool-agent | M3 · Tool Calling | 内嵌 @tool + ReAct |
| mcp-agent | M4 · MCP Agent | MCP 协议工具（默认） |
| multi-agent | M4 · Multi-Agent | 团队协作 |
| hitl-agent | M5 · HITL Agent | 危险工具确认 + 预算 |
| traced-agent | M6 · Traced Agent | Langfuse 追踪 |
| skills-agent | M8 · Skills Agent | 能力包按需加载 |
| rag-agent | M9 · RAG Agent | 知识库检索 + 引用 |
| full-agent | Full · 全功能 | 以上全部整合 |

## 关键 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /health | 健康检查 |
| GET | /api/v1/models | 可用模型列表 |
| GET | /api/v1/agents | 可用 Agent 列表 |
| POST | /api/v1/chat/stream_ndjson | 流式对话（核心，支持幂等 key） |
| POST | /api/v1/chat/send | 非流式对话 |
| POST | /api/v1/session/ | 创建会话 |
| DELETE | /api/v1/session/{id} | 删除会话 |
| GET | /api/v1/session/{id}/messages | 获取历史消息 |
| GET | /api/v1/runs/ | Agent 运行历史（分页 + 筛选） |
| GET | /api/v1/runs/{id} | 单次运行详情 + 事件溯源 |
| GET | /api/v1/runs/quota | 当前用户配额用量 |
| GET | /api/v1/ai-testing/types | 列出 6 种 AI 测试类型 |
| GET | /api/v1/ai-testing/presets/{type} | 获取某类型预置用例 |
| POST | /api/v1/ai-testing/run | 运行一次 AI 测试套件 |
| GET | /api/v1/ai-testing/history | 测试历史记录列表 |
| GET/DELETE | /api/v1/ai-testing/history/{id} | 单次测试详情 / 删除 |

## 核心数据流

```
用户输入 → FastAPI 路由 → Pydantic 校验 → 配额检查 → 幂等检查
→ Agent Registry 选 Agent → LangGraph StateGraph（agent → tools → agent → END）
→ astream_events → Run/Event 持久化 → NDJSON 流式推送 → 前端增量渲染
```

## 生产 Runtime 能力

| 能力 | 实现 | 说明 |
|------|------|------|
| Run 持久化 | `AgentRun` + `AgentEvent` 表 | 每次调用全链路事件溯源 |
| 幂等性 | `idempotency_key` 字段 | 重复请求直接返回缓存 |
| 配额限制 | `quota.py` 进程内计数 | 按用户每日 token 上限 |
| 多模态图片 | `images` 字段 + Vision API | 上传/粘贴/拖拽图片，Base64 传给 LLM |
| 输入长度保护 | 前端 4000 字符 + 后端 30K token 估算 | 超限拒绝 + context_length 错误捕获 |
| Think 折叠 | `<think>` 标签处理 | Qwen3 推理过程默认折叠、淡化 |
| 停止生成 | AbortController + 前端 stopBtn | 中断 HTTP 流 |
| Markdown | markdown-it + highlight.js | 代码高亮 + 表格 + 引用 |
| 消息反馈 | 👍👎 按钮 | 每条 assistant 消息可评价 |
| 请求追踪 | X-Request-ID header | 前后端链路对齐 |
| AI 应用测试 | `ai_testing.py` 6 种 runner + `TestRun` 持久化 | Prompt稳定性/多轮/RAG命中/工具调用/幻觉/越狱，Web UI `/ui/testing` |

---

## AI 快速索引（无需读源码即可理解）

> 下次 AI 助手读取此文件即可了解整个项目，不需要逐文件阅读源码。

### 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (localhost:8000/ui)                                     │
│  · 单 HTML 文件，无需构建                                          │
│  · markdown-it + highlight.js 渲染                                │
│  · NDJSON 流式 + AbortController 停止 + 图片上传                    │
│  · 👍👎 反馈 + X-Request-ID + 字符计数                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │ POST /api/v1/chat/stream_ndjson
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI Backend (apps/api/)                                      │
│                                                                   │
│  ┌─ Middleware ──────────────────────────────────────────────┐   │
│  │  AuthMiddleware → Quota Check → Idempotency Check         │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Agent Layer ─────────────────────────────────────────────┐   │
│  │  Registry → catalog.py (9 agents) → SingleAgent           │   │
│  │  SingleAgent = LangGraph StateGraph + ToolNode + astream  │   │
│  │  支持 images (multimodal) + token 预检 + context 错误捕获   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Tool Layer ──────────────────────────────────────────────┐   │
│  │  MCP Servers (stdio): weather / utils / dangerous / time   │   │
│  │  Fallback @tool: get_weather / calculator / search          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Persistence ─────────────────────────────────────────────┐   │
│  │  SQLite: sessions + messages + agent_runs + agent_events   │   │
│  │  LangGraph Checkpoint: AsyncSqliteSaver (对话状态持久化)      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Observability ───────────────────────────────────────────┐   │
│  │  Langfuse tracing + RunTracker (event sourcing)            │   │
│  │  Token Tracker (cost calculation)                           │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 核心文件索引（按功能域）

| 功能域 | 关键文件 | 职责 |
|--------|----------|------|
| **入口** | `app/main.py` | lifespan + 路由注册 + CORS + 静态文件 |
| **Agent 核心** | `app/agents/single/agent.py` | StateGraph 构建、stream() 流式执行、多模态、token 预检 |
| **Agent 注册** | `app/agents/catalog.py` | 9 种 Agent 工厂 + `_build_human_message()` 多模态辅助 |
| **对话 API** | `app/api/v1/chat.py` | send / stream / stream_ndjson + 幂等 + 配额 + RunTracker |
| **运行追踪** | `app/core/run_tracker.py` | AgentRun/Event CRUD，事件溯源 |
| **配额** | `app/core/quota.py` | 每日 token 限额、白名单、用量查询 |
| **配置** | `app/core/config.py` | 所有 env var（API Key / 模型 / 鉴权 / 配额 / RAG） |
| **鉴权** | `app/core/auth.py` | Bearer Token + ContextVar 协程隔离 |
| **MCP 工具** | `app/mcp_servers/loader.py` | 配置加载、venv Python 路径解析、Tool 缓存 |
| **RAG** | `app/core/rag.py` | ChromaDB 向量化 + 检索 + ENABLE_RAG 开关 |
| **上下文压缩** | `app/core/context_compressor.py` | 滑动窗口 + 摘要压缩 |
| **前端 UI** | `apps/web/src/` (Vue 3 + TS + Tailwind) | 对话/Skill商店/AI测试/日志，构建产物在 `dist/`，FastAPI 在 `/ui` 托管 |
| **Schema** | `app/schemas/chat.py` | ChatRequest（含 images / idempotency_key） |
| **数据模型** | `app/models/models.py` | Session / Message(含attachments) / AgentRun / AgentEvent / TestRun |
| **AI 测试引擎** | `app/core/ai_testing.py` + `ai_testing_cases.py` | 6 种测试类型 runner + 预置用例，详见 `docs/AI-TESTING.md` |

### 关键设计决策

| 决策 | 原因 |
|------|------|
| SQLite（非 PG） | 学习项目优先零配置，clone 即用 |
| Vue SPA + 提交 dist | FastAPI 在 `/ui` 托管构建产物，clone 后零构建可用 |
| NDJSON 流式（非 SSE） | 兼容性更好，解析更简单 |
| MCP stdio（非 HTTP） | 开发简单，子进程隔离 |
| 进程内配额（非 Redis） | 避免新增依赖，学习场景重启清零可接受 |
| Base64 图片存盘（非 URL 服务） | 无需对象存储，落盘 uploads/ 供历史回看 |
| RunTracker 非阻断 | 可观测层失败不影响核心对话功能 |
| QUOTA_WHITELIST=* 默认 | 开发模式不限制，上线改配置即启用 |
| RAG 依赖可选（requirements-rag.txt） | 默认安装轻量，RAG 关闭时不装 torch/chromadb |
| gitignore 用 /data/ 根锚定 | 避免误伤 docs/**/data/（曾导致文件漏提交） |

### 如何修改常见功能

| 想做什么 | 改哪里 |
|---------|--------|
| 加新 MCP 工具 | `app/mcp_servers/` 加 server.py + `config.json` 加注册 |
| 加新 Agent 模式 | `app/agents/catalog.py` 加 @register + 工厂函数 |
| 改系统提示词 | `app/agents/single/agent.py` 的 SystemMessage |
| 改前端 UI | `apps/web/src/`（Vue 3）→ 改完跑 `npm run build:web` 重新生成 dist |
| 加新 Skill | `skills/<name>/SKILL.md`（内置）或商店安装到 `skills/_installed/` |
| 改 Skill 匹配逻辑 | `app/core/skills.py` 的 `match_skills`（打分 + top_k） |
| 改配额限制 | `.env.dev` 的 QUOTA_DAILY_TOKENS / QUOTA_WHITELIST |
| 开启 RAG | `.env.dev` 设 ENABLE_RAG=true |
| 切换模型 | `.env.dev` 的 OPENAI_MODEL |
| 加新 API 端点 | `app/api/v1/` 加路由文件 + `main.py` 注册 |
| 加新 AI 测试类型 | `app/core/ai_testing.py` 的 `TEST_TYPES` 注册表加 runner + `ai_testing_cases.py` 加预置用例 |
| 加工具的中文展示名 | `apps/web/src/composables/toolDisplay.ts` 的 `TOOL_DISPLAY_NAMES` 加一条映射（不配也会 fallback 原名） |
| 改工具调用卡片样式/状态 | `apps/web/src/components/ToolCallBlock.vue`；配对逻辑在 `stores/chat.ts`（addToolCall / resolveToolResult / settleDanglingToolCalls） |
| 在日志里带上 trace_id | `from app.core.trace import get_logger`，用 `get_logger().info(...)` 自动带当前请求的 trace/req |
| 改 Trace-ID 头名/行为 | `app/core/trace.py`（TRACE_HEADER / REQUEST_HEADER / TraceMiddleware） |
