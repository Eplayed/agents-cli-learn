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
│   │   │   ├── chat.py          — /chat/send + /stream_ndjson（核心对话 API）
│   │   │   ├── session.py       — 会话 CRUD + 消息历史
│   │   │   └── team.py          — Multi-Agent API
│   │   ├── core/
│   │   │   ├── config.py        — Pydantic Settings（API Key / 模型 / 鉴权 / Langfuse）
│   │   │   ├── database.py      — AsyncSqlAlchemy + get_db 依赖注入
│   │   │   ├── checkpointer.py  — AsyncSqliteSaver（LangGraph 对话持久化）
│   │   │   ├── auth.py          — Bearer Token 中间件 + ContextVar 协程隔离
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
│   │   │   └── models.py        — SQLAlchemy ORM（Session + Message）
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
│   │       ├── ChatView.vue     — 主对话页
│   │       └── LogView.vue      — 日志面板
│   └── public/ui/index.html     — 旧版静态 HTML UI（保留兼容）
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
| POST | /api/v1/chat/stream_ndjson | 流式对话（核心） |
| POST | /api/v1/chat/send | 非流式对话 |
| POST | /api/v1/session/ | 创建会话 |
| GET | /api/v1/session/{id}/messages | 获取历史消息 |

## 核心数据流

```
用户输入 → FastAPI 路由 → Pydantic 校验 → Agent Registry 选 Agent
→ LangGraph StateGraph（agent → tools_condition → ToolNode → agent → END）
→ astream_events → NDJSON 流式推送 → 前端增量渲染
```
