# agents-cli-learn

一个学习型的 Agent 项目，技术栈对齐 2026 主流：**FastAPI + LangGraph 1.x + MCP + Web UI**。

> ⚠️ 旧的 TS CLI（Phase 1-2）已归档到 `archive/cli/`，不再作为主线。
> 现在的入口是 Python FastAPI 服务（`apps/api/`）。

---

## 快速开始

### 1. 装依赖（一次性）

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt    # 推荐用 uv 更快：uv pip install -r requirements.txt
```

### 2. 配置 API Key

在项目根目录创建 `.env.dev`：

```bash
cp .env.example .env.dev
# 编辑 .env.dev，填真实 OPENAI_API_KEY
```

支持自定义 `OPENAI_BASE_URL`（如 SiliconFlow / DeepSeek 等国内代理）。

### 3. 启动

```bash
npm run dev
# 或：cd apps/api && .venv/bin/uvicorn app.main:app --reload --port 8000
```

浏览器打开 **http://localhost:8000/ui**

---

## 主要能力

### 已完成（M0-M4）

| 能力 | 实现位置 |
|---|---|
| LangGraph StateGraph + ToolNode + Checkpoint 循环 | `apps/api/app/agents/single/agent.py` |
| Multi-Agent 4 模式（Sequential/Parallel/Supervisor/GroupChat） | `apps/api/app/agents/multi/team.py` |
| MCP 工具协议（stdio + HTTP）+ 配置化加载 + annotations | `apps/api/app/mcp_servers/` |
| NDJSON 流式协议 | `apps/api/app/api/v1/chat.py` `/stream_ndjson` |
| 会话持久化（SQLite + SQLAlchemy 异步） | `apps/api/app/models/models.py` |
| 真实工具调用（天气走 Open-Meteo） | `apps/api/app/mcp_servers/weather_server.py` |
| 前端模型切换（`/api/v1/models` + UI 下拉） | `apps/web/public/ui/index.html` |
| Agent 注册中心 + 多能力切换（M0/M3/M4/M5） | `apps/api/app/agents/registry.py` + `catalog.py` |
| Web UI（对话 + 会话切换 + Trace 日志面板 + 导出） | `apps/web/public/ui/index.html` |
| **AsyncSqliteSaver Checkpoint 持久化（重启不丢）** | `apps/api/app/core/checkpointer.py` |
| **预算控制（recursion_limit + max_tokens + timeout）** | `apps/api/app/agents/single/agent.py` |
| **Bearer Token 鉴权中间件（ContextVar 协程隔离）** | `apps/api/app/core/auth.py` |
| **危险工具 + HITL 确认机制** | `apps/api/app/mcp_servers/dangerous_server.py` |

### 生产 Runtime 能力（M10+）

| 能力 | 说明 | 实现位置 |
|---|---|---|
| Agent Run/Event 持久化 | 每次调用的完整事件溯源，可审计、可回放 | `app/core/run_tracker.py` + `app/models/models.py` |
| 幂等性 | `idempotency_key` 防重复执行 | `app/api/v1/chat.py` |
| Per-user 配额 | 每日 token 上限 + 白名单 | `app/core/quota.py` + `app/core/config.py` |
| 运行历史 API | 查询 runs/events/quota | `app/api/v1/runs.py` |
| 停止生成 | 前端 AbortController 中断流式 | `apps/web/public/ui/index.html` |
| Markdown 渲染 | markdown-it + highlight.js 代码高亮 | CDN + `index.html` |
| Think 折叠 | Qwen3 `<think>` 推理过程默认折叠淡化 | `index.html` renderMarkdown |
| 多模态图片 | 上传/粘贴/拖拽图片 + Vision LLM 分析 | Schema + agent + UI |
| 输入长度保护 | 前端 4000 字符 + 后端 30K token 预检 | `agent.py` + `index.html` |
| 消息反馈 | 每条回复 👍👎 评价 | `index.html` |
| 请求追踪 | X-Request-ID header 前后端链路对齐 | `index.html` apiFetch |
| 一键 setup | `./setup.sh` 自动环境搭建 | `setup.sh` |
| 配置引导 | 无 key 时 UI 显示引导卡片 | `app/api/v1/chat.py` + `index.html` |
| 面试题学习站 | 45 题系统学习 + 代码讲解 | `docs/interview/` |

### 路线图（M5-M9）

详见 [LEARNING-PLAN.md](./LEARNING-PLAN.md)。

| 里程碑 | 主题 | 状态 |
|---|---|---|
| M5 | Checkpoint 持久化 + 预算控制 + 鉴权 | ✅ 已完成 |
| M6 | OpenTelemetry + Langfuse 可观测 | ✅ 已完成 |
| M7 | 评测体系（10 条回归用例 + 4 种断言） | ✅ 已完成 |
| M8 | Skills 框架（渐进式加载能力包） | ✅ 已完成 |
| M9 | RAG 知识库检索（ChromaDB + 引用标注） | ✅ 已完成 |

---

## 目录结构

```
agents-cli-learn/
├── apps/
│   ├── api/                       # Python FastAPI 后端
│   │   ├── app/
│   │   │   ├── agents/single/     # 单 Agent（LangGraph）
│   │   │   ├── agents/multi/      # Multi-Agent 4 模式
│   │   │   ├── api/v1/            # chat / team / session 路由
│   │   │   ├── core/              # 配置 + DB
│   │   │   ├── mcp_servers/       # MCP servers（stdio）
│   │   │   ├── models/            # SQLAlchemy ORM
│   │   │   ├── schemas/           # Pydantic
│   │   │   └── main.py            # FastAPI app
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   └── web/public/ui/             # 静态 Web UI（HTML + fetch + NDJSON）
├── archive/cli/                   # TS CLI（Phase 1-2 学习资产，归档）
├── docs/
│   ├── ARCHITECTURE.md            # 6 张架构图（mermaid）
│   ├── GAP-ANALYSIS.md            # 对照 agent-service-toolkit 的差距分析
│   ├── MCP-INTEGRATION.md         # M4 MCP 集成实施记录
│   ├── RUNNING.md                 # 详细运行手册
│   └── diagrams.html              # 浏览器架构图查看器
├── LEARNING-PLAN.md               # 学习路线（M0-M9）
├── README.md
└── package.json                   # 仅用于 npm run dev / diagrams 等便捷脚本
```

---

## 常用入口

| 用途 | 地址 / 命令 |
|---|---|
| Web 对话界面 | http://localhost:8000/ui |
| API Swagger 文档 | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/health |
| 模型列表 | http://localhost:8000/api/v1/models |
| 启动服务 | `npm run dev` |
| 启动架构图查看器 | `npm run diagrams` → http://localhost:9000/docs/diagrams.html |
| 详细运行手册 | [docs/RUNNING.md](./docs/RUNNING.md) |
| 架构图 | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |

---

## 参考项目

按学习用途分类：

- **架构对齐**：[JoshuaC215/agent-service-toolkit](https://github.com/JoshuaC215/agent-service-toolkit)
- **生产化模板**：[wassim249/fastapi-langgraph-agent-production-ready-template](https://github.com/wassim249/fastapi-langgraph-agent-production-ready-template)
- **MCP 入门**：[langchain-ai/langchain-mcp-adapters](https://github.com/langchain-ai/langchain-mcp-adapters)
- **MCP 工作流**：[lastmile-ai/mcp-agent](https://github.com/lastmile-ai/mcp-agent)
- **Next.js 前端**：[langchain-ai/agent-chat-ui](https://github.com/langchain-ai/agent-chat-ui)

---

## License

ISC


---

## 🐳 Docker 部署

```bash
# 一键启动（需要先配好 .env.dev）
docker compose up --build

# 后台运行
docker compose up -d

# 查看日志
docker compose logs -f api

# 停止
docker compose down
```

访问 http://localhost:8000/ui

---

## 🧪 自动化测试

```bash
# 本地运行
cd apps/api
.venv/bin/python -m pytest tests/ -v

# 运行评测（需要 OpenAI Key）
.venv/bin/python -m eval.run_eval
```

CI 自动跑（GitHub Actions）：每次 push/PR 自动执行测试。

---

## 🤝 如何贡献

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/my-feature`
3. 提交改动：`git commit -m "feat: add xxx"`
4. 推送并创建 PR

### 代码规范
- Python：遵循项目现有风格，函数有 docstring
- 前端：Vue 3 Composition API + TypeScript
- 提交信息：遵循 [Conventional Commits](https://www.conventionalcommits.org/)（feat/fix/docs/test）

### 加新工具
1. 新建 `apps/api/app/mcp_servers/xxx_server.py`
2. 在 `mcp_servers/config.json` 注册
3. 重启 API 即可（不需要改 agent 代码）

### 加新 Skill
1. 新建 `apps/api/skills/my-skill/SKILL.md`
2. 写好 frontmatter（triggers）和正文
3. 重启 API 即可

---

## 📄 License

MIT
