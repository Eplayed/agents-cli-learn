# CowAgent Web-only 目录重构 PRD（针对本仓库 my-agent-cli）

> 目标：将仓库目标明确收敛为“只做 Web”，设计最优目录结构与迁移方案；剥离非 Web 模块；明确 Web 功能边界；给出迁移步骤、风险与回滚策略。

---

## 1. 背景与问题

当前仓库同时包含：
- TypeScript CLI 学习工程：`/src`（Phase 1–2）
- Python FastAPI + Web UI：`/phase3-backend`（Phase 3）

当目标收敛为“只做 Web”时，现状会带来：
- 入口与心智负担：两套 runtime（Node + Python）并存
- 文档与依赖成本：安装/启动/排错路径被分裂
- 代码复用困难：协议与类型（请求/响应/事件）在两边重复定义

---

## 2. 目标（Goals）

- G1：仓库结构以 Web 为中心，做到“一眼看懂入口”
- G2：明确 Web 核心功能边界（会话/对话/工具/日志/记忆/评测/运维）
- G3：剥离非 Web 相关模块，但保留可回滚/可追溯路径（不破坏历史学习资产）
- G4：为后续 MCP/Skills/Evals/Observability 扩展留出清晰扩展位

## 3. 非目标（Non-goals）

- 不在本 PRD 中立即重写成全新的 Agent 框架
- 不强制将后端从 FastAPI 迁移到其他语言/框架
- 不在本 PRD 中实现所有新功能，仅定义“可执行的重构方案”

---

## 4. Web-only 核心功能边界（Scope）

### 4.1 必须保留（Web 核心）
- Web UI：对话、会话列表、工具可视化、日志面板、导出
- Web API：chat/team/session、流式协议（NDJSON）、鉴权/限流（最小版）
- 数据：Session/Message（SQLite/Postgres 可切换）
- 可观测：Trace→Span→Event（前端 + 后端透传逐步完善）
- 测评：最小回归集（工具调用、结构化输出、场景对话）

### 4.2 需要剥离（非 Web）
- Node CLI 交互与相关示例（Phase 1–2）：`/src`
- CLI 专属工具注册逻辑与会话文件系统 `.sessions/`

> 注意：剥离不等于删除。建议移动到 `archive/` 或拆分到独立仓库，保证可回滚。

---

## 5. 目录重构方案（Proposed Structure）

### 5.1 推荐目录树（单仓库 Web-only）

```
my-agent-cli/
  apps/
    web/                      # Web 前端（建议 Next.js 15；短期也可先迁移现有静态页）
      src/
      public/
      package.json
    api/                      # Python FastAPI 后端（由 phase3-backend 迁入）
      app/
      requirements.txt
      pyproject.toml (可选)
      .env.example
  packages/
    shared/                   # 前后端共享协议与类型（OpenAPI/JSON Schema/TS types）
      schemas/
      openapi/
  eval/                       # 回归集与评测脚本（web-only）
  docs/
    architecture/
    prd/
  archive/
    cli/                      # 迁移自原 /src（Phase1-2），只读保留
  README.md
  LEARNING-PLAN.md
```

### 5.2 为什么这样分（Rationale）
- apps/web 与 apps/api 强制边界：避免“前端文件混在后端目录里”
- packages/shared 收敛协议：请求/响应/事件类型统一，减少重复与不一致
- eval/ 独立：保证每次改动可回归，防止能力退化
- archive/cli 保留历史资产：满足“只做 Web”的同时不丢学习路径成果

---

## 6. 迁移步骤（Migration Plan）

> 原则：每一步都可回滚；每一步之后都能启动并跑通健康检查与关键 API。

### Step 0：冻结 API 协议与事件类型
- 固定 NDJSON 事件类型（text/tool_calls/tool_result/error/done）
- 固定 session/messages 的响应字段
- 输出到 `packages/shared/schemas/*`（或 docs/openapi）

### Step 1：后端目录迁移
- 将 `phase3-backend/` 迁移到 `apps/api/`
- 更新启动命令与相对路径（例如 env_file 读取路径、UI 静态文件路径）
- 校验：`/health`、`/api/v1/session/*`、`/api/v1/chat/*`、`/api/v1/team/*` 全部通过

### Step 2：前端目录迁移
两条路径（二选一）：
- A) 先保持现有静态页：将 `app/ui/index.html` 迁移到 `apps/web/public/ui/index.html`，后端仅提供 API
- B) 直接迁移到 Next.js：在 `apps/web` 内实现对话页、会话列表、日志面板（复用你当前 UI 逻辑）

### Step 3：剥离 CLI（Web-only）
- 将 `/src` 移动到 `archive/cli`
- 根 README 删除 CLI 作为主入口，仅保留“历史参考”
- package.json 若仅服务 Web，则移到 apps/web（或根改为 workspace）

### Step 4：共享协议落地
- 把前后端重复的 request/response 定义迁入 `packages/shared`
- 前端消费 shared types；后端以 OpenAPI/JSON Schema 为权威

### Step 5：回归与发布脚手架
- eval/ 增加最小回归集（≥30）
- docs/ 增加“启动、调试、导出日志、回放”的说明

---

## 7. 风险清单（Risks）

- R1：路径与相对引用断裂：后端读取 UI/配置/DB 文件路径变化
- R2：启动流程混乱：venv、node_modules、端口、env 文件位置需要统一
- R3：协议漂移：前后端对事件类型/字段理解不一致，导致 UI 解析失败
- R4：历史资产丢失：删除 CLI 会让 Phase1–2 学习无法复盘（因此建议 archive）
- R5：重构期间可用性下降：需要以回归集与健康检查护航

---

## 8. 回滚策略（Rollback）

- 回滚粒度以“目录迁移步骤”为单位：
  - Step1 回滚：将 apps/api 退回 phase3-backend，恢复原启动方式
  - Step2 回滚：回到后端托管静态 UI 的 /ui 方式
  - Step3 回滚：archive/cli 可还原到 /src（不建议长期依赖）
- 强制要求：
  - 每个 step 合并前必须跑通：health + session + chat stream_ndjson + team stream_ndjson
  - 导出日志样本必须可用，作为回放依据

---

## 9. 验收标准（Acceptance Criteria）

- 仓库入口清晰：默认只需启动 Web API + Web UI 即可使用
- 文档清晰：新目录结构、启动方式、调试方式与常见问题可定位
- 关键功能稳定：会话管理/工具可视化/日志面板/导出可用
- CLI 被剥离但可回溯：archive/cli 保留完整代码与学习注释

