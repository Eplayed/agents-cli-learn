# 🤖 Agent 开发学习计划（Web-only）

> 基于 my-agent-cli 项目实践（只做 Web：FastAPI + Web 前端），面向 2026-04 主流 Agent 技术栈。

---

## 🎯 目标收敛：只做 Web

### Web-only 的含义
- 仅保留 Web UI + Web API 作为主要入口
- `/src`（TypeScript CLI）不再作为主线（建议迁移到 `archive/cli` 仅供参考）

### Web-only 的核心交付物
- Web UI：对话、历史会话、工具可视化、日志面板（Trace→Span→Event）、导出
- Web API：chat/team/session、NDJSON 流式协议、错误分层、预算控制（最小版）
- 可回归：最小回归集（工具调用、结构化输出、场景对话）
- 可上线：Docker Compose、基本鉴权/限流、可观测与告警（最小版）

---

## 📊 里程碑总览（可验收）

| Milestone | 范围 | 验收标准（简要） | 状态 |
|---|---|---|---|
| M0 | 目标收敛 + 协议/目录 PRD | PRD 文件齐全，边界明确 | ✅ |
| M1 | Web 后端（API + Agent Runtime） | NDJSON 流式稳定；tool input/output 可见；错误分层 | ✅（持续迭代） |
| M2 | Web 前端（学习控制台） | 会话列表/切换；日志面板；导出可用 | ✅（持续迭代） |
| M3 | 场景能力（可回归） | 天气/搜索/计算场景可用；≥30 回归用例框架 | ✅（持续扩展） |
| M4 | Skills/MCP（Web-only） | MCP Server + Skills manifest + UI 管理 | ⏳ |
| M5 | Memory/RAG（长期记忆） | 摘要/向量检索；引用可解释；回放可复现 | ⏳ |
| M6 | Evals/Observability/DevOps | eval 一键跑；trace_id 贯通；compose 一键起停 | ⏳ |

**仓库**: https://github.com/Eplayed/agents-cli-learn

---

## 🧭 推荐学习顺序（Web-only）

- 先把“API 协议 + 流式 + 工具可视化”固定（M1）
- 再把“会话管理 + 日志分层 + 导出”做到能复盘（M2）
- 用 3–5 个日常场景把能力落地，并做回归集（M3）
- 再引入 MCP/Skills 与长期记忆（M4/M5）
- 最后补齐评测、观测与交付（M6）

---

## ✅ M1：Web 后端（FastAPI + Agent Runtime）

### 学习重点
- HTTP 边界：传输层与 Agent Runtime 解耦
- NDJSON 流式协议：事件类型稳定、可消费、可回放
- 工具工程：参数 schema、输入/输出可见、超时/重试/降级
- 错误分层：用户/工具/模型/系统
- 预算控制：max_steps / max_tool_calls / max_time（最小版）

### 验收清单（必须能跑通）
- `/health`
- `/api/v1/session/summary`（会话摘要：最后消息预览）
- `/api/v1/session/{id}/messages`（历史消息可加载）
- `/api/v1/chat/send`（非流式）
- `/api/v1/chat/stream_ndjson`（流式，含 tool input/output）
- `/api/v1/team/execute` 与 `/api/v1/team/stream_ndjson`

---

## ✅ M2：Web 前端（对话学习控制台）

### 学习重点
- 会话状态管理：列表/选中会话/消息加载/刷新
- 流式渲染：ReadableStream 按行解析 NDJSON
- 可观测 UI：Trace→Span→Event、搜索/筛选/导出
- 工具可视化：tool_calls/tool_result 折叠展示

### 验收清单
- 10+ 个会话切换不串扰
- 日志面板能定位一次请求的关键链路与耗时
- 导出 JSON/文本可用于复盘

---

## ✅ M3：日常场景能力（可回归）

### 场景优先级（建议）
- S1：天气 + 洗车建议（必须先调用 get_weather，再给结论+依据）
- S2：联网搜索 + 摘要（provider 可替换）
- S3：计算/解析（强校验与防注入）

### 回归体系（最小）
- 统一用例格式（jsonl/yaml）：id/input/assertions/tags/permissions
- 断言类型：必须调用/禁止调用某工具、必须包含某关键数据、不得泄露敏感信息

---

## ⏳ M4：Skills/MCP（Web-only）

### 学习重点
- Tool 抽象标准化：name/description/input_schema/permission/timeout/idempotency
- Skills：manifest + 资源文件 +（可选）prompt/流程
- MCP：tools/resources/prompts 的标准接口与安全边界

### 验收清单
- MCP Server（stdio 或 http）至少 2 个只读工具
- Skills 可安装/启停/版本化，UI 可管理

---

## ⏳ M5：Memory/RAG（长期记忆）

### 学习重点
- 会话摘要策略（窗口/摘要/实体）
- 向量检索与引用可解释（回答中标注来源）
- 轨迹检索（tool run 复用）

### 验收清单
- memory upsert/search API
- 每次回答可显示“引用了哪些记忆片段”

---

## ⏳ M6：Evals / Observability / DevOps（上线交付）

### 学习重点
- Evals：离线回归、失败用例复盘、指标（通过率/延迟/成本）
- Observability：trace_id 贯通、关键耗时与错误率统计
- DevOps：Docker Compose、配置与密钥、版本与回滚

### 验收清单
- eval 一键跑（≥30 用例）输出通过率与失败列表
- docker compose 一键启动（web + api + db）
- 最小鉴权/限流与审计日志

---

## ⏱️ 时间节点（不做“估时”，只给可落地的交付顺序）

- T0：目标收敛（Web-only）与 PRD 完成
- T1：M1 可验收（后端关键路径全通）
- T2：M2 可验收（前端会话+日志+导出全通）
- T3：M3 可验收（3 个场景 + 最小回归框架）
- T4：M4/M5/M6 依次推进（先标准化工具/技能，再做长期记忆，再做交付与回归）

---

*最后更新: 2026-04-10*

### 架构

```
┌─────────────────────────────────────────────────────┐
│                    FastAPI Backend                    │
├─────────────────────────────────────────────────────┤
│  /api/v1/chat      → Single Agent (LangGraph)       │
│  /api/v1/team      → Multi-Agent (Crew/Team)       │
│  /api/v1/session   → Session/Message 管理          │
├─────────────────────────────────────────────────────┤
│  SQLite + SQLAlchemy (异步)                         │
│  MemorySaver (LangGraph Checkpoint)                 │
└─────────────────────────────────────────────────────┘
```

### 核心代码

#### 单 Agent (agents/single/agent.py)
```python
class SingleAgent:
    def _build_graph(self):
        workflow = StateGraph(AgentState)
        workflow.add_node("agent", self._agent_node)
        workflow.add_node("tools", self._tools_node)
        workflow.add_conditional_edges("agent", self._should_continue, 
                                       {"continue": "tools", "end": END})
        return workflow.compile(checkpointer=self.checkpointer)
```

#### Multi-Agent (agents/multi/team.py)
| 模式 | 说明 | 代码 |
|------|------|------|
| Sequential | 顺序执行 A→B→ | `await workerA.execute()` → `await workerB.execute()` |
| Parallel | 并行执行 A‖B‖C | `asyncio.gather(*tasks)` |
| Supervisor | 主管分配 | LLM 判断分配给谁 |
| Crew | 完整团队 | Task + Agent + 迭代优化 |

### SSE 流式响应
```python
async def chat_stream(request: ChatRequest):
    async for chunk in agent.stream(request.message):
        yield {"event": "message", "data": json.dumps(chunk)}
```

### 核心概念补全
- API 边界：将“Agent Runtime”与“HTTP 传输层”解耦，便于接入前端/MCP/A2A
- 会话与持久化：Session/Message、Checkpoint、幂等请求 id
- 异步与并发：工具调用的超时、取消、限流；多 agent 的并行编排
- 认证与限流（最小版）：API Key / JWT / Rate limit（避免被滥用）
- 可观测：结构化日志、trace id、每步耗时与 token 统计（用于调优）

### 核心功能清单（建议补齐）
- 统一工具注册中心：描述（schema/权限/超时/重试/可见性）+ 执行器
- 统一输出协议：SSE chunk 事件类型（token、tool_call、tool_result、final、error）
- 运行时预算：每次请求最大步数/最大工具次数/最大 token/最大耗时
- 错误分层：用户错误（参数不合法）/工具错误/模型错误/系统错误

### 实现计划
- [x] 固定 API 边界：HTTP 层只负责鉴权/参数校验/传输，Agent Runtime 独立
- [x] 实现会话与持久化：Session/Message + checkpoint（断点续跑）
- [x] 实现 SSE 协议：事件类型与错误事件统一，前端可直接消费
- [x] 实现并发治理：超时/取消/限流（每会话与全局）
- [x] 实现最小安全：API Key 或 JWT（任选其一）+ 基础 Rate limit
- [x] 统一错误分层与错误码：便于回归统计与告警

### 回归点（Phase 3）
- API 回归：同一请求在无外部依赖变化时输出结构稳定（事件序列稳定）
- 数据回归：会话写入/读取一致；断点续跑不丢状态
- 并发回归：并行请求互不串扰（chatId/session 隔离）
---

## 🌐 Phase 4: MCP/A2A 协议 (待开始)

### 4.1 MCP (Model Context Protocol)

**定位**：把“工具/资源/提示词”以统一协议暴露给模型/Agent，降低工具集成成本。

**协议栈**:
- Server/Client 架构
- tools/resources/prompts 标准化接口
- STDIO / HTTP 传输
- 生态定位：由 Anthropic 发起并推动的工具标准化协议，用于把“外部能力/上下文”以统一接口提供给模型与 Agent

**实现计划**:
- [ ] MCP Server 框架（最小可用：stdio transport + tools 列表）
- [ ] 文件系统工具（读/写/搜索，带权限白名单）
- [ ] Git 工具（log/diff/status）
- [ ] 搜索工具（Brave/Tavily/自建）


#### MCP 核心概念补全
- Tools：可调用能力（参数 schema、权限级别、超时、幂等性）
- Resources：可读取上下文（文件、数据库记录、网页摘要），强调“只读”和可缓存
- Prompts：可复用的提示词模板（用于一致性与可控性）
- Transport：STDIO（本地集成）优先于 HTTP（远程部署）；HTTP 需要鉴权与速率控制
- 安全边界：工具分级（read/write/danger）、用户确认、沙箱与审计

#### MCP 核心功能（建议拆里程碑）
- M1：STDIO MCP Server + 2 个只读工具（文件读取/简单搜索）
- M2：加入 Git 只读工具（diff/status/log）+ 参数校验与超时
- M3：加入远程 HTTP Transport + 鉴权（API Key/JWT）+ Rate limit
- M4：工具审计与回放：每次 tool call 可记录并可重放（用于调试与回归）

#### Anthropic/Claude 相关能力（建议加入到 Phase 4 实战）
- Claude Tool Use：以严格 schema 驱动工具调用；配套参数校验、重试与幂等设计
- Prompt Caching（如使用 Claude API）：缓存稳定系统提示词与上下文，降低成本并提升吞吐
- Computer Use（如引入浏览器自动化）：把“UI 操作”当作高风险工具，强制确认与审计

### 4.2 Agent Skills（Anthropic）

#### 核心概念
- Skills：由说明文档、脚本与资源组成的“能力包”，按任务相关性动态加载（progressive disclosure）
- Skills vs MCP：MCP 负责连接外部工具/数据，Skills 负责固化“如何用这些工具”的流程与规范
- Skill Schema：输入/输出/权限声明，提升可控性与回归稳定性

#### 实战里程碑（建议）
- S1：跑通 Anthropic 预置 Skills（pdf/xlsx/docx/pptx 任一）生成产物文件并下载
- S2：写一个自定义 Skill（如“PR Review 流程/数据集质量检查流程”），内部调用 MCP 工具（文件/Git/搜索）
- S3：把 Skill 产物与回归体系打通：统计触发率、schema 通过率、失败用例与原因分布

#### 回归点（Agent Skills）
- 触发回归：该触发时触发、不该触发时不误触发
- 产物回归：生成文件可打开且内容符合预期（或结构化输出字段齐全）
- 权限回归：涉及写入/危险操作必须确认并记录审计信息
### 4.3 A2A (Agent-to-Agent)


**协议栈**:
- Agent Card (能力描述)
- JSON-RPC 2.0
- SSE/WebSocket（流式）

**实现计划**:
- [ ] Agent Card 注册
- [ ] 任务委托（含进度/取消）
- [ ] 跨 Agent 通信（鉴权 + 速率限制）


#### A2A 核心概念补全
- Agent Card：能力/输入输出 schema/工具权限/服务端点/版本信息
- Task Delegation：委托请求（任务、约束、预算）→ 状态查询 → 结果回收
- 可靠性：超时、重试、幂等、取消（cancel）与进度（progress）
- 多方协作：一个 supervisor 选择合适的远程 agent（路由/负载/成本）

### 回归点（Phase 4）
- 协议回归：MCP/A2A 的请求与响应严格符合 schema（反序列化不失败）
- 工具安全回归：危险工具必须触发确认；未授权请求必须被拒绝
- 兼容性回归：协议版本升级不破坏旧 client（至少兼容一个前版本）

### 4.4 工具生态

| 工具 | 功能 |
|------|------|
| Playwright | Browser 自动化 |
| Sandbox / Code Interpreter | 安全沙箱代码执行（强隔离） |
| Search API | 联网搜索（可替换） |
| Vector DB | RAG 检索（pgvector/Weaviate 等） |

---

## 💻 Phase 5: Next.js 前端 (待开始)

### 技术栈
- Next.js 15 (App Router)
- Tailwind CSS + shadcn/ui
- SSE 流式接收

### 页面规划
- [ ] 首页/仪表盘
- [ ] 对话页面 (单 Agent)
- [ ] 团队页面 (Multi-Agent)
- [ ] 会话历史
- [ ] 设置 (API Key)

### 可视化
- [ ] Agent 执行流程图
- [ ] 状态/记忆查看
- [ ] Token 消耗统计


### 核心概念补全
- 流式渲染：SSE/EventSource（或 fetch stream）如何驱动 UI 增量更新
- 前后端协议：与后端对齐事件类型（tool_call/tool_result/final/error）
- 会话状态：前端 store（会话列表、消息流、选中会话、回放 trace）
- 可观测 UI：把“每一步发生了什么”可视化，比“聊天窗口好看”更重要

### 核心功能清单（建议补齐）
- Trace 面板：显示节点序列、工具参数、工具结果摘要、耗时与 token
- 回放能力：从一次会话的 trace 重放输出（便于复现与调试）
- Eval Dashboard（最小版）：展示回归用例通过率、失败用例列表与 diff

### 实现计划
- [ ] 初始化 Next.js 项目（App Router）并对齐后端 API 路径
- [ ] 实现 SSE 客户端：事件流消费、断线重连、错误展示
- [ ] 实现会话页：消息流、工具调用可视化、引用 trace 的详情
- [ ] 实现 Trace 面板：节点序列/耗时/token/工具参数与结果摘要
- [ ] 实现回放：从存量 trace 重放一次会话（用于复现与分享）
- [ ] 实现 Eval Dashboard（最小版）：展示通过率与失败用例列表

### 回归点（Phase 5）
- 流式稳定性：网络抖动/刷新页面后仍能恢复会话与继续流式
- 渲染一致性：同一条 SSE 事件序列在 UI 中呈现一致
---

## 🚀 Phase 6: 生产化（部署/可观测/评测/安全）(待开始)

### 6.1 Docker Compose
```yaml
services:
  backend:     # FastAPI
  frontend:    # Next.js
  postgres:    # 数据库
  redis:       # 缓存
  nginx:       # 反向代理
```

### 6.2 Kubernetes
- Deployment / Service / Ingress
- ConfigMap / Secret
- Helm Chart

### 6.3 可观测性与评测（2026 生产必备）
- Tracing/Logging/Metrics（OpenTelemetry + 可视化平台）
- Evals：离线集评测 + 线上 A/B + 回归测试
- Prompt/配置版本化（可回滚）
- JWT/OIDC 认证 + RBAC
- Rate Limiting + 审计日志


### 核心概念补全
- 配置与密钥：环境变量、Secret 管理、轮换策略（不落盘、不进日志）
- 可观测三件套：Logs / Metrics / Traces；以及告警（latency、error rate、cost）
- 弹性与可靠性：限流、熔断、重试、超时、队列化（长任务）
- 成本与配额：按用户/租户的 token、工具调用、并发配额
- 安全：TLS、CORS、WAF/网关、最小权限、审计日志

### 回归点（Phase 6）
- 部署回归：升级后接口兼容（前端与 client 不报错）
- 灾备回归：服务重启后会话/断点可恢复（checkpoint 生效）
- 性能回归：P95 延迟、错误率、token 成本不劣化

### 实现计划
- [ ] Docker Compose：后端/前端/数据库/缓存/网关最小可用编排
- [ ] 配置与密钥：Secret 管理、环境隔离、禁日志泄露
- [ ] 观测与告警：日志、指标、trace 与关键告警规则
- [ ] 安全与治理：鉴权、限流、配额、审计、危险工具确认策略落地
- [ ] 生产演练：重启恢复、回放复现、回归集一键跑通
---


## 🧪 测评与回归（贯穿 Phase 1-6）

### 目标
- 防止能力回退：每次改 prompt / 工具 / 图结构都能快速发现问题
- 量化迭代收益：看得见的通过率、延迟、成本、工具正确率变化

### 指标（建议最少收集）
- Schema Valid Rate：结构化输出可解析比例
- Tool Precision：该调用工具时是否调用、参数是否正确、结果是否被正确使用
- Task Pass Rate：任务级用例通过率（断言满足）
- Latency/Cost：P50/P95 耗时、token、外部调用次数
- Safety：危险工具触发确认/拒绝是否生效；越权调用是否被拦截

### 用例分层
- Unit：工具函数（参数校验、超时、错误处理）
- Integration：单 agent 图（节点序列、工具调用、状态变更）
- E2E：HTTP API（SSE 事件序列）与前端渲染（如已完成 Phase 5）

### 用例格式（建议统一为 jsonl / yaml）
- 必填字段：`id`, `input`, `assertions`, `tags`, `permissions`
- 可选字段：`expected_schema`, `max_steps`, `max_cost`, `fixtures`
- assertions 示例：包含必须字段、禁止字段、必须调用/禁止调用某工具、最终回答必须包含某信息

### 最小回归集（建议从 30 条开始）
- 10 条：结构化输出（边界值、缺字段、类型错误）
- 10 条：工具调用（该用工具/不该用工具/参数混淆）
- 5 条：长对话记忆（窗口/摘要切换）
- 5 条：安全用例（危险动作确认、拒绝后不执行）

### 实现计划（Evals）
- [ ] 定义用例规范：id/input/assertions/tags/permissions
- [ ] 统一断言类型：schema 校验、工具调用断言、关键内容断言、禁止行为断言
- [ ] 记录评测产物：通过率、失败清单、失败原因（分类）与关键指标（耗时/token）
- [ ] 接入回放：失败用例可从 trace 复现并定位到节点/工具
- [ ] 接入 CI（如已有）：PR 必跑最小回归集，防止回退

---

## 📖 学习资源

### 官方文档
- [LangChain.js](https://js.langchain.com/)
- [LangGraph](https://langchain-ai.github.io/langgraph/)
- [OpenAI Responses API](https://platform.openai.com/docs/guides/responses-vs-chat-completions)
- [OpenAI Agents SDK（含 MCP）](https://openai.github.io/openai-agents-python/mcp/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [MCP Spec](https://modelcontextprotocol.io/)
- [A2A Protocol](https://google.github.io/A2A/)

### Anthropic/Claude 专题
- Agent Skills：把流程/规范打包为 Skills，提升一致性与可回归性
- Claude Tool Use：schema 驱动的工具调用工程实践（参数校验、幂等、重试、权限分级）
- Constitutional AI / RLAIF：理解安全对齐对工具边界、拒答策略的影响

### 角色库与协作（可选）
- agency-agents：开箱即用的“智能体角色库”，每个角色包含身份、规则、流程与交付物，可安装到 Claude Code / Cursor 等工具中作为协作与提示词参考
- 使用方式：精选 10-20 个常用角色（代码审查/安全审计/后端架构/前端开发等），用于规范化“多角色协作”的输入输出与交接模板

### 项目参考
- [LangChain AI](https://github.com/langchain-ai)
- [AutoGen](https://microsoft.github.io/autogen/)
- [CrewAI](https://docs.crewai.com/)

---

## ✅ 任务清单

### 本周任务
- [ ] 理解 Phase 3 所有核心模块代码
- [ ] 配置 BRAVE_API_KEY 实现搜索
- [ ] 实现 Phase 4 MCP Server 基础框架
- [ ] 建立最小回归集（≥30 条）+ 通过率统计

### 下周任务
- [ ] 实现 A2A 协议
- [ ] Next.js 前端初始化
- [ ] Docker Compose 完整编排
- [ ] 接入 Trace 面板与回放（Phase 5 可视化）

---

*最后更新: 2026-04-07*
