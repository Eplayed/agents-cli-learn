# Agent 开发学习计划（2026 主流栈对齐版）

> 仓库：https://github.com/Eplayed/agents-cli-learn
> 路线：Web-only（FastAPI + LangGraph + Web 前端）
> 最后更新：2026-05-28

---

## 0. 学习方法论（为什么这样学）

**学习 Agent 开发，最容易踩的坑是"框架学得多，工程做得浅"。**

我们采用「**对照参考仓库 + 增量改造自己的项目**」的方法：

1. **每个里程碑挂一个主参考仓库**：你不是从零写，而是带着问题去读别人的代码
2. **每一步都先讲"为什么"再讲"怎么做"**：理解动机比抄代码重要
3. **不追新只追主流**：2026 已经稳定下来的技术（LangGraph 1.x / MCP / OpenTelemetry）才学
4. **每个里程碑必须可验收**：不是"看完了"，而是"能跑通某个场景"

---

## 1. 当前项目状态（M0-M3 已完成）

```
apps/
├── api/                # Python FastAPI 后端
│   ├── app/agents/     # 单 Agent + Multi-Agent (4 种模式)
│   ├── app/api/v1/     # chat / team / session 路由
│   ├── app/core/       # 配置 + DB
│   ├── app/models/     # SQLAlchemy ORM
│   └── app/schemas/    # Pydantic
└── web/public/ui/      # 静态 Web UI（HTML + fetch + NDJSON）

archive/cli/            # TS CLI（Phase 1-2 学习资产，归档）
```

**已具备能力：**
- ✅ LangGraph StateGraph + ToolNode + MemorySaver（单 Agent tool calling 循环）
- ✅ Multi-Agent 4 种模式（Sequential / Parallel / Supervisor / GroupChat）
- ✅ NDJSON 流式协议（更通用，避开 SSE 在内嵌浏览器的兼容问题）
- ✅ SQLite + SQLAlchemy 异步持久化（Session / Message）
- ✅ 真实工具调用（`get_weather` 调 Open-Meteo API）
- ✅ MCP 工具协议（weather_server + utils_server，配置化加载）
- ✅ 前端模型切换（`/api/v1/models` + UI 下拉选择器）

**对照 2026 主流栈的差距（要补的）：**

| 维度 | 当前实现 | 2026 主流 | 差距优先级 |
|---|---|---|---|
| 工具协议 | stdio MCP 已完成（weather/utils），HTTP transport 待完成 | MCP Client/Server（stdio + http 混用） | 🟡 部分完成 |
| Checkpoint | `MemorySaver`（每次构造都新建，重启即丢；DB 仅保存业务消息，LangGraph 图状态未持久化） | `AsyncSqliteSaver` / `AsyncPostgresSaver`（lifespan 内全局共享） | 🔴 高 |
| 可观测 | print + DB 落库 | OpenTelemetry GenAI + Langfuse | 🔴 高 |
| 预算控制 | 无 | `recursion_limit` + max_tokens + timeout | 🔴 高 |
| 评测 | 无 | DeepEval / pytest + trajectory eval | 🟡 中 |
| HITL | 无 | `interrupt()` + Web UI 审批 | 🟡 中 |
| 鉴权/限流 | 无 | JWT + slowapi | 🟡 中 |
| 长期记忆 | 无 | `Store` API + 向量检索 | 🟢 低 |
| 前端 | 静态 HTML（含模型切换/会话管理/日志面板） | Next.js + agent-chat-ui | 🟢 低 |
| A2A | 无 | A2A 协议（仅在多团队互通时需要） | 🟢 低 |

---

## 2. 主参考仓库（按用途分类）

| 用途 | 仓库 | 用法 |
|---|---|---|
| **架构对齐**（最重要） | [JoshuaC215/agent-service-toolkit](https://github.com/JoshuaC215/agent-service-toolkit) | 整体结构 + Agent 注册中心 + 客户端 SDK |
| **生产化** | [wassim249/fastapi-langgraph-agent-production-ready-template](https://github.com/wassim249/fastapi-langgraph-agent-production-ready-template) | JWT/限流/Langfuse/Prometheus |
| **MCP 入门** | [langchain-ai/langchain-mcp-adapters](https://github.com/langchain-ai/langchain-mcp-adapters) | MCP 工具接入 LangGraph |
| **MCP Server 例子** | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | Filesystem / GitHub / Slack 等官方 server |
| **MCP 工作流** | [lastmile-ai/mcp-agent](https://github.com/lastmile-ai/mcp-agent) | Anthropic 6 种 agent 模式实现 |
| **前端（成品）** | [langchain-ai/agent-chat-ui](https://github.com/langchain-ai/agent-chat-ui) | Next.js + 流式 + HITL |
| **前端（带 MCP+HITL）** | [agentailor/fullstack-langgraph-nextjs-agent](https://github.com/agentailor/fullstack-langgraph-nextjs-agent) | Next.js + Prisma + MCP + HITL |
| **MCP Server 模板** | [oraios/serena](https://github.com/oraios/serena) | 工业级 MCP Server 写法 |

---

## 3. 学习路线（M4 → M9）

### M4：MCP 工具协议（🔴 最高优先级）

**为什么先做这个？**
- MCP 是 2026 工具集成的事实标准（Anthropic 提出 / 已成"AI 的 USB-C"）
- 只要做了 MCP，你的工具就能被 Claude Desktop / Cursor / Codex / 任何 MCP Host 复用
- 不做 MCP，你永远只能写"内部工具"，无法对接生态

**主参考**：[langchain-mcp-adapters](https://github.com/langchain-ai/langchain-mcp-adapters)

**学习子目标：**
1. 理解 MCP 三个原语：`tools` / `resources` / `prompts`
2. 用 `FastMCP` 写一个最简 stdio Server（如计算器、文件读取）
3. 用 `MultiServerMCPClient` 在你的 SingleAgent 里加载 MCP 工具
4. 把现有的 `get_weather` 拆成独立 MCP Server（学会"内部工具 → MCP 工具"的迁移）
5. 加一个 HTTP transport 的 MCP Server（学会远程部署）
6. 给每个工具配置 **annotations 四字段**：`readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`
7. 工具 **description 按规范写**：说明目的（what）+ 使用场景（when）+ 输出内容（output），参数描述放 inputSchema 里

**可验收：**
- [x] `apps/api/app/mcp_servers/weather_server.py` 能用 `python -m` 单独跑
- [x] `apps/api/app/agents/single/agent.py` 通过 MCP 配置加载工具
- [x] 同时挂载 ≥2 个 MCP Server（当前两个均为 stdio：weather + utils）
- [x] 至少一个 HTTP transport 的 MCP Server（`time_server.py` 在 8001 端口）
- [x] 工具增减只改 `mcp_servers/config.json`，不改 agent 代码
- [x] 每个工具都有 annotations 标注 + 规范的 description

**配套阅读：**
- [LangChain MCP 官方文档](https://docs.langchain.com/oss/python/langchain/mcp)
- [MCP 规范：Server / Resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [MCP Tool Annotations 规范](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#annotations)
- ToolHive 托管 MCP 接入开发指南 §5（annotations 最佳实践 + 五类工具标注速查表）

---

### M5：Checkpoint 持久化 + 预算控制（🔴 必补）

**为什么必补？**
- `MemorySaver` 重启就丢全部对话状态，HITL/中断恢复完全没用
- 没有预算控制 = LLM 死循环烧钱（已知风险）

**主参考**：[fastapi-langgraph-agent-production-ready-template](https://github.com/wassim249/fastapi-langgraph-agent-production-ready-template) 的 `agent.py`

**学习子目标：**
1. 把 `MemorySaver` 换成 `AsyncSqliteSaver`（SQLite 文件持久化）
2. 给 `graph.invoke()` 加 `config={"recursion_limit": 25}`（防死循环）
3. 给 `ChatOpenAI` 加 `max_tokens` + `timeout`
4. 实现 `max_tool_calls` 限制（在 ToolNode 前加计数器节点）
5. 用 LangGraph `interrupt()` 在危险工具前介入（HITL）
6. 实现 **Bearer Token 鉴权中间件**（参考 ToolHive 模式）：
   - 用 `ContextVar` 做协程级用户上下文隔离（不能用全局变量，并发会覆盖）
   - JWT 解析客户端必须是**模块级单例**（避免每请求重建缓存触发限流）
   - 验签失败返回 `None`（不抛异常），由 `get_current_user()` 统一返回 401
   - 没设 `AUTH_SECRET` 时放开鉴权（开发友好）
7. 理解**工具敏感度分级**（PUB / LOW / MED / HIGH / 黑名单），为危险工具加 `elicitInput` 二次确认

**可验收：**
- [x] 重启 API 后能继续上次对话（`thread_id` 复用）
- [x] 故意问"无限循环"问题，agent 在 25 步内强制结束
- [x] 调用 `dangerous_tool` 时有确认机制（需输入 DELETE ALL）
- [x] 设了 `AUTH_SECRET` 后，无 Bearer Token 的请求返回 401
- [x] 并发请求用 ContextVar 隔离，互不干扰

**配套阅读：**
- ToolHive 托管 MCP 接入开发指南 §4（ContextVar + JWKS 单例 + 中间件实现）
- ToolHive 托管 MCP 接入开发指南 §6（Cedar Policy + 敏感度分级 + elicitInput）

---

### M6：可观测性 OpenTelemetry + Langfuse（🔴 生产必备）

**为什么用 Langfuse？**
- 自托管开源（不锁厂商）
- 原生支持 LangGraph trace
- 用 OpenTelemetry GenAI semantic conventions（行业标准）

**主参考**：[Langfuse OpenTelemetry 集成](https://langfuse.com/docs/opentelemetry/get-started)

**学习子目标：**
1. Docker 起一个本地 Langfuse
2. 给 `ChatOpenAI` 加 `langfuse-callback`，所有 LLM 调用自动上报
3. 给工具调用加 OTel span（手动 instrumentation）
4. trace_id 贯穿 Web UI → API → Agent → Tool（HTTP header 传递）
5. Web UI 加 "查看 trace" 按钮，跳转 Langfuse

**可验收：**
- [ ] Langfuse 控制台能看到完整执行树（agent → tool → LLM）
- [ ] 失败用例可点 trace_id 直接定位到出错节点

---

### M7：评测体系 DeepEval（🟡 防回退）

**为什么用 DeepEval？**
- pytest 风格 → 直接接 CI
- 支持 trajectory eval（评估"过程"而非只看"最终输出"）

**主参考**：[DeepEval](https://github.com/confident-ai/deepeval) + [Anthropic Evals 文档](https://docs.anthropic.com/en/docs/build-with-claude/evaluating-prompts)

**学习子目标：**
1. 写 30 条最小回归集（`eval/cases.jsonl`）
2. 实现 4 类断言：必须调用工具、必须包含字段、禁止泄露、JSON Schema 校验
3. 用 DeepEval 跑回归，输出通过率 + 失败 trace_id 列表
4. 加到 GitHub Actions（PR 必跑）

**可验收：**
- [x] `python -m eval.run_eval` 输出每条用例的通过率
- [x] 失败用例有详细原因（哪个断言没过 + 实际值）
- [x] 10 条用例覆盖：天气/计算/无工具场景

---

### M8：Skills 框架（🟡 借鉴 Anthropic）

**为什么做？**
- CowAgent 的 plugin 机制思路对，但实现过时
- Anthropic Skills（SKILL.md + 渐进式加载）才是 2026 标准

**主参考**：[anthropics/skills](https://github.com/anthropics/skills)（如有公开） + [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills)

**学习子目标：**
1. 定义 Skill manifest 格式（`SKILL.md` + YAML frontmatter）
2. 实现 SkillLoader：扫描 `apps/api/skills/` 目录，按需加载到 system prompt
3. UI 增加 "已启用 Skills" 列表 + 启停开关
4. 写 2 个示例 Skill：`pr-review`（代码审查流程）、`weather-and-carwash`（天气场景固化）

**可验收：**
- [ ] 启停 Skill 不需要重启 API
- [ ] 一次对话用了哪些 Skill 在 trace 里可见

---

### M9：长期记忆 + RAG（🟢 进阶）

**为什么放最后？**
- 没有可观测和评测，做记忆容易做出"看着像但不可控"的系统
- 等前面都稳了，再加记忆收益最大

**主参考**：LangGraph `Store` API + [pgvector](https://github.com/pgvector/pgvector)

**学习子目标：**
1. 用 LangGraph `Store` 做"用户偏好"记忆（短期）
2. 引入 pgvector 做语义检索（长期）
3. 在回答里**显式标注引用来源**（必须可解释）

**可验收：**
- [ ] "我喜欢喝咖啡" → 下次问推荐饮料时能召回
- [ ] 每条回答下方显示"引用了 N 条记忆"，点开可见原文

---

## 4. CowAgent 思想迁移对照表

CowAgent 仍有值得借鉴的**工程思想**（不是技术）。下面列出每个思想在 2026 主流栈下应该用什么实现：

| CowAgent 思想 | 2026 实现 | 在哪个里程碑做 |
|---|---|---|
| Plugin 可安装/启停/优先级 | Skills + MCP Server 配置 | M4 + M8 |
| Plugin 事件总线（emit_event） | LangGraph 节点 + 条件边 | 已有 |
| `agent_max_steps` | `recursion_limit` | M5 |
| `agent_max_context_turns` | LangGraph `pre_model_hook` 修剪历史 | M5 |
| `agent_workspace`（运行目录） | LangGraph `Store` + 文件型 MCP Server | M9 |
| 一键运维脚本（cow CLI） | Docker Compose + Makefile | M6 收尾 |
| 多通道（微信/飞书/钉钉） | **不做**（Web-only 不需要） | - |

### ToolHive 企业级 MCP 实践借鉴

ToolHive 是企业级 MCP 托管平台的落地案例，其设计思想对本项目未来生产化有直接参考价值：

| ToolHive 思想 | 对本项目的启示 | 在哪个里程碑做 |
|---|---|---|
| MCP Server 只做业务，认证全部剥离给网关 | 用 Bearer Token 中间件替代应用内认证 | M5 |
| ContextVar 协程级隔离用户上下文 | 替代全局变量，解决 FastAPI 并发串用户 | M5 |
| JWKS 客户端必须模块级单例（避免限流雪崩） | 和我们的 `_GLOBAL_CHECKPOINTER` 同一设计理念 | M5 |
| Tool annotations 四字段（readOnly/destructive/idempotent/openWorld） | 让客户端（Claude Desktop 等）正确判断工具风险等级 | M4 收尾 |
| Tool description 编写规范（what + when + output） | 提高 LLM 工具调用准确率 | M4 收尾 |
| 敏感度分级（PUB/LOW/MED/HIGH/黑名单） | 为不同工具配不同审批策略 | M5（HITL） |
| `elicitInput` 二次确认（MCP 2025 spec） | 比 `destructiveHint` 更可靠的用户确认，不可绕过 | M5（HITL） |
| Cedar Policy 工具粒度权限（forbid 优先） | 学习项目暂不实现，但理解"默认拒绝"原则 | 了解即可 |

---

## 5. 不在本计划范围（明确放弃）

- ❌ A2A 协议：除非要做"多团队 agent 互通"，单项目用不上
- ❌ 多通道接入：CowAgent 强项，但你的目标是 Web-only
- ❌ Computer Use（浏览器自动化）：高风险，等基础牢固后再考虑
- ❌ 自研 agent runtime：LangGraph 已经够好，不重复造轮子

---

## 6. 面试题库规划（面试反推知识）

> 核心思路：**面试题反推知识 → 知识对应项目代码**。每道面试题都标注"在你项目里对应什么"。

### 6.1 参考题库来源

| 来源 | 定位 | 借鉴点 |
|---|---|---|
| [adongwanai/AgentGuide](https://github.com/adongwanai/AgentGuide) | AI Agent 开发 × 面试求职一站式，区分算法岗/开发岗 | 分层学习路径 + 1000+ 题 + 项目落地方法 |
| [guocong-bincai/ai-interview-guide](https://github.com/guocong-bincai/ai-interview-guide) | AI 应用开发工程师面试宝典 | LLM / RAG / Agent / MCP / 安全 / 部署 |
| [didilili/ai-agents-from-zero](https://github.com/didilili/ai-agents-from-zero) | AI 智能体开发面试题库 | 偏 RAG / Agent / MCP / LangGraph / 工程落地 |

### 6.2 面试知识分类（对应项目实际代码）

| 面试方向 | 典型考题 | 你项目里的对应 | 所属里程碑 |
|---|---|---|---|
| **Agent 核心** | ReAct 循环怎么实现？和 Function Calling 什么关系？ | `agent.py::_build_graph` 的 tools_condition 循环 | M0/M3 |
| **LangGraph** | StateGraph vs Chain 区别？Checkpoint 怎么跨请求恢复？ | `_build_graph` + `_GLOBAL_CHECKPOINTER` 单例 | M3 |
| **MCP 协议** | MCP 三原语？stdio vs http？无状态 session 含义？ | `mcp_servers/` 全套 + `loader.py` docstring | M4 |
| **流式协议** | SSE vs NDJSON 区别？前端怎么解析流？ | `chat.py::chat_stream_ndjson` + `index.html::streamNDJSON` | M2 |
| **工具工程** | 工具 description 怎么写？annotations 四字段含义？ | `weather_server.py` docstring + ToolHive 最佳实践 | M4 |
| **异步并发** | 为什么 LLM 调用必须 async？依赖注入怎么隔离请求？ | `chat.py` 的 `Depends(get_db)` + `database.py` | M1 |
| **鉴权安全** | Bearer Token 中间件怎么写？ContextVar 为什么不能用全局变量？ | M5 待实现（参考 ToolHive §4） | M5 |
| **可观测** | trace_id 怎么贯穿全链路？Langfuse vs LangSmith？ | M6 待实现 | M6 |
| **评测** | trajectory eval 是什么？怎么防止 prompt 改了能力退化？ | M7 待实现 | M7 |
| **RAG** | 向量检索 + 引用可解释？chunking 策略？ | M9 待实现 | M9 |
| **Multi-Agent** | Sequential / Parallel / Supervisor 适用场景？ | `agents/multi/team.py` 四种模式实现 | M3 |
| **系统设计** | 设计一个支持 10w QPS 的 Agent 服务？ | 整体架构图（docs/ARCHITECTURE.md） | 综合 |

### 6.3 学习游戏接入规划

面试题将以新关卡类型接入 learn-game：

```
docs/learn-game/data/
  ├── m0.js ... m4.js          ← 学习关卡（已有）
  ├── interview-agent.js       ← 面试题：Agent 核心（计划中）
  ├── interview-langgraph.js   ← 面试题：LangGraph（计划中）
  ├── interview-mcp.js         ← 面试题：MCP 协议（计划中）
  ├── interview-rag.js         ← 面试题：RAG（计划中）
  ├── interview-system.js      ← 面试题：系统设计（计划中）
  └── levels.js                ← 注册所有关卡
```

**面试关卡的独特设计**：
- 每题带 `interviewTip` 字段：面试时怎么答能加分
- 每题带 `projectMapping` 字段：对应你项目的哪行代码
- 难度标注：⭐（入门）/ ⭐⭐（中级）/ ⭐⭐⭐（高级/系统设计）
- 支持"模拟面试模式"：随机抽题 + 计时 + 评分

### 6.4 优先级

M0-M4 学习关卡做完后（当前），下一步：
1. **先做 interview-agent.js**（Agent 核心 15 题）— 最高频
2. **再做 interview-mcp.js**（MCP 10 题）— 2026 热点
3. **再做 interview-langgraph.js**（LangGraph 10 题）— 和项目代码直接对应
4. 其他方向等 M5-M9 实现后再加

---

## 7. 不在本计划范围（明确放弃）

- ❌ A2A 协议：除非要做"多团队 agent 互通"，单项目用不上
- ❌ 多通道接入：CowAgent 强项，但你的目标是 Web-only
- ❌ Computer Use（浏览器自动化）：高风险，等基础牢固后再考虑
- ❌ 自研 agent runtime：LangGraph 已经够好，不重复造轮子

---

## 8. 时间安排建议（不强求）

学习项目不宜定死时间，但可以参考节奏：

- **本周**：M4 完成（MCP 接入）
- **下周**：M5 完成（Checkpoint + 预算）
- **后续**：M6/M7 并行推进（可观测和评测互相依赖）
- **面试题库**：学习关卡和里程碑推进过程中，穿插做面试题（不单独排时间）

---

## 9. 自检清单

学完每个 M，问自己 3 个问题：
1. **能不能给一个不熟悉的人讲清楚这个技术解决什么问题？**
2. **能不能不看任何文档，复现核心代码？**
3. **能不能在自己的项目里独立用上？**

三个都"能"才算掌握。

---

> 内容根据公开搜索结果做了改写以符合引用规范
