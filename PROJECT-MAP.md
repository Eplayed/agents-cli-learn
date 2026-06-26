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
│   │   │   └── runs.py          — Agent 运行历史 + 事件溯源回放 + 配额查询
│   │   ├── core/
│   │   │   ├── config.py        — Pydantic Settings（API Key / 模型 / 鉴权 / Langfuse）
│   │   │   ├── database.py      — AsyncSqlAlchemy + get_db 依赖注入
│   │   │   ├── checkpointer.py  — AsyncSqliteSaver（LangGraph 对话持久化）
│   │   │   ├── auth.py          — Bearer Token 中间件 + ContextVar 协程隔离
│   │   │   ├── run_tracker.py   — Agent Run/Event 持久化（事件溯源 + 幂等）
│   │   │   ├── quota.py         — Per-user 每日 token 配额限制
│   │   │   ├── tracing.py       — Langfuse callback handler（可观测追踪）
│   │   │   ├── rag.py           — ChromaDB 向量检索（docs/*.md 知识库）
│   │   │   ├── skills.py        — SKILL.md 解析 + 触发词匹配 + prompt 注入
│   │   │   ├── token_tracker.py — Token 消耗统计 + 费用计算
│   │   │   └── context_compressor.py — 对话自动压缩（窗口 + 摘要）
│   │   ├── mcp_servers/
│   │   │   ├── config.json      — MCP Server 注册表（加工具只改这里）
│   │   │   ├── weather_server.py — 天气查询（stdio, readOnly, openWorld）
│   │   │   ├── utils_server.py  — 计算器 + 搜索占位（stdio, readOnly）
│   │   │   ├── dangerous_server.py — 删除/转账模拟（HITL 演示, destructive）
│   │   │   ├── time_server.py   — 时间工具（HTTP transport 演示）
│   │   │   └── loader.py        — MCP 配置加载 + MultiServerMCPClient 缓存
│   │   ├── models/
│   │   │   └── models.py        — SQLAlchemy ORM（Session + Message + AgentRun + AgentEvent）
│   │   └── schemas/
│   │       └── chat.py          — Pydantic 请求/响应 Schema
│   ├── eval/
│   │   ├── cases.jsonl          — 10 条回归评测用例
│   │   └── run_eval.py          — 评测脚本（4 种断言 + CI 返回码）
│   ├── skills/
│   │   ├── weather-advisor/SKILL.md — 天气顾问能力包（触发词：天气/洗车）
│   │   └── code-reviewer/SKILL.md  — 代码审查能力包（触发词：代码/review）
│   └── tests/
│       ├── test_health.py       — 健康检查 + 元信息端点（5 tests）
│       ├── test_session.py      — 会话 CRUD（7 tests）
│       ├── test_chat.py         — Chat API 校验（6 tests）
│       ├── test_agents_registry.py — Agent 注册中心（5 tests）
│       ├── test_mcp_servers.py  — MCP 工具直接调用（11 tests）
│       └── test_auth.py         — ContextVar 鉴权隔离（5 tests）
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
│   │   │   └── useApi.ts        — API 请求封装
│   │   ├── components/
│   │   │   ├── ChatMessage.vue  — 消息气泡（Markdown 渲染）
│   │   │   ├── ToolCallBlock.vue — 工具调用折叠块
│   │   │   ├── TokenStats.vue   — Token 消耗面板
│   │   │   ├── AgentSelector.vue — Agent 模式切换
│   │   │   ├── ModelSelector.vue — 模型选择
│   │   │   ├── SessionList.vue  — 会话列表
│   │   │   └── TypingIndicator.vue — 等待动画
│   │   └── views/
│   │       ├── ChatView.vue     — 主对话页（流式+图片+反馈+字符计数）
│   │       ├── SkillsView.vue   — Skill 商店（在线搜索/已安装/本地）
│   │       └── LogView.vue      — 日志面板
│   └── dist/                    — Vue 构建产物（提交进 git，FastAPI 在 /ui 托管）
│
├── docs/                        — 文档 + GitHub Pages 站点
│   ├── index.html               — Pages 门户首页
│   ├── .nojekyll                — 禁用 Jekyll（保护 _ 开头文件）
│   ├── diagrams.html            — 架构图浏览器查看器
│   ├── ARCHITECTURE.md          — 6 张 Mermaid 架构图 + Harness 七层映射
│   ├── GAP-ANALYSIS.md          — 对标 agent-service-toolkit 差距分析
│   ├── MCP-INTEGRATION.md       — M4 MCP 集成实施记录 + annotations 最佳实践
│   ├── RUNNING.md               — 本地运行手册
│   ├── DEPLOYMENT.md            — GitHub Pages 部署指南
│   ├── STUDY-NOTES.md           — M0-M4 学习笔记
│   ├── interview/               — 面试题系统学习（Vue 3 CDN 组件化）
│   │   ├── index.html           — 入口（importmap + Vue ESM）
│   │   ├── css/styles.css       — 样式（复用门户设计变量）
│   │   └── js/                  — 6 模块 45 题 + 真实代码讲解
│   └── learn-game/              — 交互式学习闯关游戏
│       ├── index.html           — 游戏入口
│       ├── css/styles.css       — 全部样式
│       ├── data/
│       │   ├── levels.js        — 关卡注册中心
│       │   ├── m0.js ~ m9.js    — 10 个学习关卡
│       │   ├── interview-agent.js     — 面试题：Agent 核心（15 题）
│       │   ├── interview-advanced.js  — 面试题：进阶（13 题）
│       │   ├── interview-engineering.js — 面试题：工程深入（12 题）
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
| **前端 UI** | `apps/web/src/` (Vue 3 + TS + Tailwind) | 对话/Skill商店/日志，构建产物在 `dist/`，FastAPI 在 `/ui` 托管 |
| **Schema** | `app/schemas/chat.py` | ChatRequest（含 images / idempotency_key） |
| **数据模型** | `app/models/models.py` | Session / Message(含attachments) / AgentRun / AgentEvent |

### 关键设计决策

| 决策 | 原因 |
|------|------|
| SQLite（非 PG） | 学习项目优先零配置，clone 即用 |
| 单 HTML UI（非 SPA） | 无需 npm install，FastAPI 直接托管 |
| NDJSON 流式（非 SSE） | 兼容性更好，解析更简单 |
| MCP stdio（非 HTTP） | 开发简单，子进程隔离 |
| 进程内配额（非 Redis） | 避免新增依赖，学习场景重启清零可接受 |
| Base64 图片（非 URL） | 无需文件存储服务，一次请求搞定 |
| RunTracker 非阻断 | 可观测层失败不影响核心对话功能 |
| QUOTA_WHITELIST=* 默认 | 开发模式不限制，上线改配置即启用 |

### 如何修改常见功能

| 想做什么 | 改哪里 |
|---------|--------|
| 加新 MCP 工具 | `app/mcp_servers/` 加 server.py + `config.json` 加注册 |
| 加新 Agent 模式 | `app/agents/catalog.py` 加 @register + 工厂函数 |
| 改系统提示词 | `app/agents/single/agent.py` 的 SystemMessage |
| 改前端 UI | `apps/web/src/`（Vue 3）→ 改完跑 `npm run build:web` 重新生成 dist |
| 加新 Skill | `skills/<name>/SKILL.md`（内置）或商店安装到 `skills/_installed/` |
| 改配额限制 | `.env.dev` 的 QUOTA_DAILY_TOKENS / QUOTA_WHITELIST |
| 开启 RAG | `.env.dev` 设 ENABLE_RAG=true |
| 切换模型 | `.env.dev` 的 OPENAI_MODEL |
| 加新 API 端点 | `app/api/v1/` 加路由文件 + `main.py` 注册 |
