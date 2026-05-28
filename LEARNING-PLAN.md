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

**对照 2026 主流栈的差距（要补的）：**

| 维度 | 当前实现 | 2026 主流 | 差距优先级 |
|---|---|---|---|
| 工具协议 | 写死在 `agents/single/agent.py` | MCP Client/Server | 🔴 高 |
| Checkpoint | `MemorySaver`（内存，重启丢） | `AsyncSqliteSaver` / `AsyncPostgresSaver` | 🔴 高 |
| 可观测 | print + DB 落库 | OpenTelemetry GenAI + Langfuse | 🔴 高 |
| 预算控制 | 无 | `recursion_limit` + max_tokens + timeout | 🔴 高 |
| 评测 | 无 | DeepEval / pytest + trajectory eval | 🟡 中 |
| HITL | 无 | `interrupt()` + Web UI 审批 | 🟡 中 |
| 鉴权/限流 | 无 | JWT + slowapi | 🟡 中 |
| 长期记忆 | 无 | `Store` API + 向量检索 | 🟢 低 |
| 前端 | 静态 HTML | Next.js + agent-chat-ui | 🟢 低 |
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

**可验收：**
- [ ] `apps/api/app/mcp_servers/weather_server.py` 能用 `python -m` 单独跑
- [ ] `apps/api/app/agents/single/agent.py` 通过 MCP 配置加载工具
- [ ] 同时挂载 ≥2 个 MCP Server（一个 stdio + 一个 http）
- [ ] 工具增减只改配置，不改 agent 代码

**配套阅读：**
- [LangChain MCP 官方文档](https://docs.langchain.com/oss/python/langchain/mcp)
- [MCP 规范：Server / Resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)

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

**可验收：**
- [ ] 重启 API 后能继续上次对话（`thread_id` 复用）
- [ ] 故意问"无限循环"问题，agent 在 25 步内强制结束
- [ ] 调用 `dangerous_tool` 时返回 `interrupt`，前端展示确认按钮

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
- [ ] `pytest eval/` 输出每条用例的通过率与耗时
- [ ] 失败用例可点 trace_id 跳到 Langfuse 看现场

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

---

## 5. 不在本计划范围（明确放弃）

- ❌ A2A 协议：除非要做"多团队 agent 互通"，单项目用不上
- ❌ 多通道接入：CowAgent 强项，但你的目标是 Web-only
- ❌ Computer Use（浏览器自动化）：高风险，等基础牢固后再考虑
- ❌ 自研 agent runtime：LangGraph 已经够好，不重复造轮子

---

## 6. 时间安排建议（不强求）

学习项目不宜定死时间，但可以参考节奏：

- **本周**：M4 完成（MCP 接入）
- **下周**：M5 完成（Checkpoint + 预算）
- **后续**：M6/M7 并行推进（可观测和评测互相依赖）

---

## 7. 自检清单

学完每个 M，问自己 3 个问题：
1. **能不能给一个不熟悉的人讲清楚这个技术解决什么问题？**
2. **能不能不看任何文档，复现核心代码？**
3. **能不能在自己的项目里独立用上？**

三个都"能"才算掌握。

---

> 内容根据公开搜索结果做了改写以符合引用规范
