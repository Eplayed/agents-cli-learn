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

## 1. 当前项目状态（M0-M9 + M11 已完成）

```
apps/
├── api/                # Python FastAPI 后端
│   ├── app/agents/     # 单 Agent + Multi-Agent (4 种模式)
│   ├── app/api/v1/     # chat / team / session 路由
│   ├── app/core/       # 配置 + DB
│   ├── app/models/     # SQLAlchemy ORM
│   └── app/schemas/    # Pydantic
└── web/               # Vue 3 前端（src/ 源码 + dist/ 构建产物，FastAPI 在 /ui 托管）

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
| Checkpoint | `AsyncSqliteSaver`（dev）/ `AsyncPostgresSaver`（Postgres 时自动切，M13.5）；lifespan 内全局共享 | `AsyncSqliteSaver` / `AsyncPostgresSaver` | ✅ 已完成 |
| DB 迁移/扩展 | Alembic 迁移 + SQLite(dev)/Postgres(生产) 双库（M13.5） | Alembic + Postgres | ✅ 已完成 |
| 可观测 | print + DB 落库 | OpenTelemetry GenAI + Langfuse | 🔴 高 |
| 预算控制 | 无 | `recursion_limit` + max_tokens + timeout | 🔴 高 |
| 评测 | 无 | DeepEval / pytest + trajectory eval | 🟡 中 |
| HITL | 无 | `interrupt()` + Web UI 审批 | 🟡 中 |
| 鉴权/限流 | 多用户 JWT + bcrypt（M13）+ per-user 配额 | JWT + slowapi | ✅ 鉴权已完成（限流/RPS 待补） |
| 长期记忆 | 无 | `Store` API + 向量检索 | 🟢 低 |
| 前端 | Vue 3（对话/Skill商店/AI测试/日志面板，dist 提交 git 零构建） | Next.js + agent-chat-ui | ✅ 已完成 |
| AI 测试 | 6 种测试类型 + Web UI（prompt稳定性/多轮/RAG/工具调用/幻觉/越狱） | DeepEval / trajectory eval | ✅ 已完成 |
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
| **架构借鉴**（生产级 harness 设计） | [bytedance/deer-flow](https://github.com/bytedance/deer-flow) | Harness/App 分层边界、全链路 trace-id、Goal 自动续跑护栏（M12） |
| **架构借鉴**（业务落地体验） | `crm-ai-h5`（内部项目，只读参考） | 工具调用人话翻译+流式可视化（P0）、轻量 trace-id 中间件（P1）（M12） |

---

## 3. 学习路线（M4 → M14）

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

### M11：AI 应用测试（✅ 已完成）— 从"能跑"到"能验证"

**为什么要单独做这块？**
- M7 的 `eval/run_eval.py` 已经证明"LLM 输出非确定性"这个核心矛盾——传统单测的"输出==期望值"断言在这里失效
- 但 M7 只覆盖了工具调用这一个维度，AI 应用真实要测的面更广：Prompt 会不会输出飘、RAG 检索准不准、多轮记忆有没有丢、模型会不会瞎编、恶意输入能不能防住
- 这些问题在面试里越来越高频（"你怎么测你的 Agent"几乎是必问题），值得系统化、可视化地做一遍

**核心设计原则**：断言"属性"而非"精确值"。LLM 两次运行的措辞可以不同，但关键词覆盖率、输出长度区间、工具调用正确性、有无虚假信息等"属性"应该保持稳定——这是所有 AI 测试方法共同的底层逻辑。

**6 种测试类型：**

1. **Prompt 稳定性测试**（`prompt_stability`）
   同一 Prompt 重复运行 N 次（默认 3 次），检查：
   - 关键词是否每次都出现（`must_contain_all`）
   - 输出长度的波动系数 `(max-min)/mean` 是否超过阈值（默认 0.6）
   意义：改 Prompt / 换模型前后做回归对比，量化"有没有变得不稳定"。

2. **多轮对话测试**（`multi_turn`）
   设计一个多轮序列：前面轮次"埋点"信息（如"我叫小明"），最后一轮问回这些信息，断言回答中出现埋入内容。全程用同一个 `thread_id` 贯穿。
   意义：验证 Checkpoint/上下文记忆机制是否真的生效（这是本项目 M5 踩过的真实坑——每请求 new 一个 checkpointer 导致记忆丢失）。

3. **RAG 命中率测试**（`rag_hit_rate`）
   直接调用 `retriever.ainvoke(query)`（不经过 LLM 生成），检查 Top-K 结果的来源文档是否覆盖预期文件名。
   意义：把"检索"和"生成"两个环节拆开测——只看最终回答会把"检索错了但 LLM 靠自身知识蒙对"误判为通过。本质是信息检索里的 Recall@K 指标。

4. **工具调用准确性测试**（`tool_calling`）
   三个维度：该调用工具时是否调用（正向）、不该调用时是否没调（反向）、调用后结果是否被正确引用到最终回答（防止"调了工具但答案是编的"）。

5. **幻觉检测测试**（`hallucination`）
   故意问"模型不该知道"或"不存在"的东西（虚构函数名、未发生的未来事件），断言回答中出现承认不确定的表达，而不是自信编造虚假细节。

6. **异常输入 / 越狱测试**（`adversarial`）
   越狱提示（"忽略之前所有指令"）、危险请求（"删除所有数据不需要确认"）、边界输入（空/超长/纯符号），断言：没有被越狱、没有无确认执行危险操作、没有崩溃或超时。

**主参考**：DeepEval 的"属性断言"思路 + Anthropic Evals 文档（评估流程设计）+ 信息检索的 Recall@K / Precision@K 指标定义

**实现位置：**
- `apps/api/app/core/ai_testing.py` — 6 个测试 runner + 统一的 `CaseResult`/`TestSuiteResult` 结构
- `apps/api/app/core/ai_testing_cases.py` — 每种类型的预置用例（开箱即测）
- `apps/api/app/models/models.py::TestRun` — 每次运行的结果持久化（历史趋势查看）
- `apps/api/app/api/v1/ai_testing.py` — `/types` `/presets/{type}` `/run` `/history` 端点
- `apps/web/src/views/TestingView.vue` — Web UI：选类型 → 编辑用例 JSON → 运行 → 看结果/历史

**可验收：**
- [x] `/ui/testing` 页面能选测试类型、编辑用例、点击运行、看到逐用例的 pass/fail + 原因
- [x] 6 种类型都有开箱即用的预置用例，不需要先自己写用例
- [x] 每次运行结果落库，历史 tab 可查看趋势 + 点开看详情
- [x] RAG 命中率测试在 `ENABLE_RAG=false` 时明确标记"跳过"而非"失败"（避免信号污染）
- [x] 异常输入测试有超时保护（30s），恶意输入不会导致请求永久挂起

---

### M12：借鉴 DeerFlow + crm-ai-h5 的生产级设计（🟡 中优先级）

**为什么做？**
- [bytedance/deer-flow](https://github.com/bytedance/deer-flow)（字节跳动开源 super agent harness，7.6万+ star，MIT 协议）2.0 版本是一个把"沙箱执行、持久化记忆、Skill 体系、子智能体调度"打包成开箱即用运行时的完整平台
- 直接把它整体换成你的后端，会把"学习自己搭 Agent 系统"变成"学习使用 DeerFlow"，价值不一样（详见对比分析）
- 但它在几个具体工程问题上已经踩过坑、验证过方案，直接借鉴思想能让你少走弯路——**这里学的是设计，不是代码**，不引入 DeerFlow 的任何依赖
- `crm-ai-h5`（诺亚内部项目，理财顾问 AI 助手 H5）是同一批需求在真实业务场景下的落地，补了两个 DeerFlow 没覆盖到、但更贴近"C 端 Agent 应用"体验的细节：轻量级 trace-id 实现（不依赖 Langfuse）、工具调用的人话翻译

**主参考**：
- bytedance/deer-flow 的 `backend/AGENTS.md`（Harness / App Split 章节）+ `README.md`（Langfuse Tracing / Session Goals 章节）
- `crm-ai-h5` 的 `middleware.ts`（trace-id 中间件）+ `app/(activities)/claude-chat/components/constants.ts`（工具名人话翻译 + 流式增量解析）

**怎么跑起来对照学习**：把 DeerFlow clone 到本项目下的 `deer-flow-lab/`（已加入 `.gitignore`，完全独立、零代码耦合、不提交），跟着它自己的 `make setup && make dev` 起服务，边跑边对照读源码。详细步骤和验证记录见 [docs/DEERFLOW-NOTES.md](../docs/DEERFLOW-NOTES.md)。`crm-ai-h5` 是只读参考（内部项目，不 clone 进来），直接读源码即可。

**学习子目标（按优先级排序，P0 先做）：**

#### 🟢 P0 — 成本低、见效快，建议最先动手

1. **工具调用人话翻译**
   - `crm-ai-h5` 的 `constants.ts` 把底层工具名（Bash / Write / MCP 工具）翻译成中文业务语义——不是展示 `get_weather`，而是展示"正在查询天气…"
   - 对照你的项目：`catalog.py` 产出的 `tool_calls`/`tool_result` chunk 目前是原始技术名称直传到前端，`TestingView.vue` 和 `ChatView.vue` 展示的也是原始工具名
   - 加一个 `TOOL_DISPLAY_NAMES` 映射表（前端或后端均可，建议放前端 `apps/web/src/composables/` 下，改动不影响后端协议）：`get_weather` → "正在查询天气"，`calculator` → "正在计算"，新增 MCP 工具时同步补一条映射；查不到映射时 fallback 到原始工具名，不阻塞展示

2. **流式工具调用可视化**
   - `crm-ai-h5` 能从**未完成的流式 JSON** 里增量解析出中间状态，实时展示"正在生成文件…已生成约 N 字"这类进度提示，而不是等工具调用彻底结束才显示一个结果
   - 对照你的项目：目前 `tool_calls` chunk 是"调用开始"和"调用结束"两个离散事件，中间过程在 UI 上是空白/loading，用户看不到工具在做什么、做到哪了
   - **本次落地方式（诚实说明）**：把 `tool_calls`（开始）和 `tool_result`（结束）合并到**同一张工具卡片**上，做成"执行中 → 完成"的状态化展示——收到 `tool_calls` 时卡片进入 `running`（转圈 + 实时耗时秒数），收到同名 `tool_result` 时**原地**翻成 `done`（不再新增一条结果消息）。同时对报错/中止/未返回 `tool_result` 的情况做了兜底（`settleDanglingToolCalls`），避免转圈永久卡死
   - **没做的部分**：本项目现有工具（天气/计算器/搜索/时间）都是**一次性同步返回**，没有可拆解的"已完成 N%"这类内容进度，所以**没有真正的百分比进度条**。当前展示的是"状态变化 + 实时耗时"，而不是 `crm-ai-h5` 那种从流式 JSON 增量解析出的内容级进度。若未来加入耗时较长、可分段产出的工具（如生成长报告），再引入 `tool_progress` 事件类型做真进度
   - 和子目标1是同一个 UI 组件（`ToolCallBlock.vue`）的一体化改造：先做"人话翻译"，再叠加"状态化 + 耗时"

#### 🟡 P1 — 中等成本，架构/可观测性价值高

3. **Harness / App 边界检查**（工程卫生，实现依然便宜，越早加越省心）
   - DeerFlow 把"可发布的 Agent 框架代码"（`packages/harness/deerflow/*`）和"不发布的业务代码"（`app/*`，路由/鉴权/IM 集成）严格分层，并写了 CI 测试 `test_harness_boundary.py` 用 AST 检查 harness 绝不 import app
   - 对照你的项目：`app/agents/` + `app/core/` 是"可复用的 Agent 核心能力"，`app/api/` 是"业务路由"。给这条边界写一个静态检查测试：断言 `app/agents/*.py` 和 `app/core/*.py` 不 import `app.api.*`
   - 加到 pytest，作为架构守护测试跑在 CI 里

4. **全链路 Trace-ID 关联**（可观测性补强，两个参考互补）
   - DeerFlow 的做法：给每个请求生成/复用一个 trace_id，注入 Langfuse trace 的 `metadata.deerflow_trace_id`，同时通过 `X-Trace-Id` 响应头回传，前端出错时能直接拿这个 ID 去 Langfuse 里查
   - `crm-ai-h5` 的做法更轻量：`middleware.ts` 在请求入口处统一注入 `x-request-id`/`x-trace-id`/`x-user-uid`/`x-real-ip`，日志（winston）和 API 调用全链路带着这几个 header 走，**不需要先接好 Langfuse 才能做**
   - 落地顺序建议：先照 `crm-ai-h5` 的思路加一个轻量中间件（生成/复用请求头 + 结构化日志带 trace_id），验证链路打通后，再把同一个 trace_id 塞进 Langfuse callback 的 metadata（对齐 DeerFlow 的做法），两步都做完才算完整关闭这个子目标
   - 你项目已经接了 Langfuse（`tracing.py`），缺的正是这层"请求级 ID ↔ trace 关联"

#### 🔵 P2 — 流式断线续传（架构改造，源自 SSE vs NDJSON 的「改法 B」讨论）

5. **任务化 SSE + 事件重放（断线续传）**
   - 背景：`crm-ai-h5` 用「POST 建任务 + GET 观察 SSE 流」两步式，靠 SSE 的 `id:` + `Last-Event-ID` + `?after_id=` 做断线续传/事件重放；本项目原来是「单 POST 边发边收」的 NDJSON，用不上原生 SSE 的这套能力，也没有流式中途续传
   - 改造：新增 `POST /chat/tasks` 建任务（后台跑 Agent，立即返回 `task_id`）+ `GET /chat/tasks/{id}/stream` 用 SSE 观察，事件带单调 `id:`；客户端断开可带 `Last-Event-ID`/`?after_id=` 重连，服务端从该 id 之后重放
   - 关键点：Agent 在后台任务里独立运行，与 HTTP 连接解耦（客户端断开也不停）；进程内 `StreamTask` 缓冲区做全保真在线重放（含 text token），既有 `RunTracker`/`AgentEvent` 兜底跨重启的 DB 回放（只存非 text 事件 + 补发最终答案）
   - 前端 `useResumableStream.ts`：POST 建任务 → fetch 读 SSE，逐帧解析 `id/event/data`，断线后带 `Last-Event-ID` 退避重连；chunk 负载与 NDJSON 完全一致，复用同一套 `onChunk`/工具卡片逻辑。单 Agent 走此路径，Multi-Agent 仍走 NDJSON

#### 🔴 P3 — 成本高、非必需，最后再评估要不要做

6. **Goal 自动续跑护栏**（进阶，可选加分项）
   - DeerFlow 的 `/goal` 命令：设置一个"完成条件"，每轮结束后用一个非思考模型评估任务是否达成，未达成就自动续跑一次；但有明确的安全上限（默认最多 8 次自动续跑）+ 停滞检测（连续 2 次评估结果没有进展就停止）
   - 这是"让 Agent 自动跑到任务完成"这类需求的标准护栏设计——上限和停滞检测两者缺一不可，否则容易死循环烧 token
   - 实现量较大，作为可选加分项，不强制在这个里程碑完成

**可验收：**
- [x] Web UI 里工具调用展示的是人话（"正在查询天气"），不是原始函数名（`get_weather`），且新工具没配映射时能优雅 fallback
- [x] 工具调用在 UI 上是"执行中（转圈 + 实时耗时）→ 完成"的同一张卡片状态化展示，不是"loading → 突然冒出一条新结果消息"的割裂体验；报错/中止时不会永久转圈（注：现有工具均为一次性返回，暂无内容级百分比进度）
- [x] 有一个类似 `test_harness_boundary` 的静态检查测试，CI 跑得过（`tests/test_harness_boundary.py`：AST 检查 `app/agents`、`app/core` 不 import `app.api`/`app.main`）
- [x] 请求响应头里有 `X-Trace-Id` / `X-Request-Id`，结构化日志用同一个 ID 关联（`app/core/trace.py` 中间件 + loguru）；同一 trace_id 已写入 Langfuse callback 的 metadata/tags（代码就位，因本环境未配 Langfuse key 未做运行时验证）
- [x] 单 Agent 走「任务化 SSE」：`POST /chat/tasks` 建任务 + `GET /chat/tasks/{id}/stream` 观察，事件带单调 `id:`；断开后带 `Last-Event-ID`/`?after_id=` 重连能从上次事件之后重放（已用真实 LLM curl 验证：首连 id 1/2/3，重连 after_id=2 从 id 3 续上）
- [ ] （可选）设置一个目标后，Agent 会自动续跑直到目标达成，且有安全上限和停滞检测两道护栏

**配套阅读：**
- [bytedance/deer-flow](https://github.com/bytedance/deer-flow) 的 `backend/AGENTS.md`（Harness / App Split 章节）
- [bytedance/deer-flow](https://github.com/bytedance/deer-flow) 的 `README.md`（Langfuse Tracing / Session Goals 章节）
- `crm-ai-h5` 的 `docs/项目导读.md`（亮点 2、5）+ `middleware.ts` + `constants.ts`

---

## M13：多用户鉴权（生产化硬缺口，已完成）

**动机**：原来是「全局共享一个 `AUTH_SECRET`」——所有通过认证的请求 `user_id` 相同，
导致 per-user 配额形同虚设，也没有真正的用户概念。这是上生产前的头号缺口。

**做了什么：**
1. **用户表 + 密码哈希**：新增 `User` 模型（`models.py`），密码用 **bcrypt** 哈希存储（`app/core/security.py`），从不存明文。
2. **JWT 签发/验签**：HS256，用 stdlib（hmac/hashlib/base64）实现，不引入新依赖；签名密钥用 `SECRET_KEY`，带 `exp` 过期校验，验签用恒定时间比较。
3. **鉴权端点**（`app/api/v1/auth.py`）：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`。
4. **中间件升级**（`app/core/auth.py`）：Bearer token 先按遗留 `AUTH_SECRET` 恒定时间比较（**向后兼容**），否则按 JWT 验签解析出真实 `user_id`/`username`/`role`；未设密钥且无 token 仍为开发模式匿名（保持既有行为）。真实 `user_id` 一路带进配额，per-user 配额从此生效。
5. **顺带修测试债**：`conftest.py` 在 `client` fixture 里显式 `init_db()`，修复「fresh clone / 新增表未创建」时 `no such table` 的历史问题（配合 `database.py` 在 pytest 下用 `NullPool`）。

**可验收：**
- [x] 注册/登录返回 JWT；`/auth/me` 带 JWT 返回真实用户身份，篡改 token 返回 401，错误密码返回 401（已用真实 curl + 70 项 pytest 验证）
- [x] 遗留 `AUTH_SECRET` 共享密钥仍可用（向后兼容），且比较改为恒定时间
- [x] fresh clone / 全新 DB 下 `pytest tests/ -q` 全绿（用临时 DATABASE_URL 验证 70 passed）

**未做（诚实标注，后续 A 类缺口）：**
- 前端登录 UI（当前仅后端 API + 中间件）
- token 刷新 / 登出黑名单、RBAC 细粒度权限、多租户数据隔离
- 生产启动校验（DEBUG 默认关、SECRET_KEY 非默认值 fail-fast）、Postgres + Alembic 迁移
- 计算器 `eval()` 收敛、关闭的证书校验、高危工具审批门

---

## M13.5：Postgres + Alembic 迁移（生产化硬缺口，已完成）

**动机**：原来只有 SQLite + `create_all` + 手写 ALTER，只能单机、没有版本化迁移，谈不上水平扩展。

**做了什么：**
1. **Alembic 落地**（`alembic.ini` + `migrations/env.py` 异步引擎 + 初始迁移 `initial_schema`）：url 取自 `settings.DATABASE_URL`，迁移和运行时同一个库；模型用 SQLAlchemy 通用类型，同一套迁移 SQLite/Postgres 都能跑。
2. **init_db 分方言**（`database.py`）：SQLite（dev）保留 `create_all` 零配置；Postgres（生产）不自动建表，只校验连通性并提示 `alembic upgrade head`，避免和版本管理打架。
3. **Checkpointer 分方言**（`checkpointer.py`）：Postgres 时自动用 `AsyncPostgresSaver`（多机共享对话状态，真正水平扩展的关键），未装 pg checkpointer 时优雅降级到本地 SQLite 并告警。
4. **操作指南**：`docs/DATABASE.md`（双库切换、生产上线流程、常用 Alembic 命令、注意事项）。

**可验收：**
- [x] `alembic upgrade head` 在全新 SQLite 上建出全部 6 张表 + `alembic_version`（已验证）
- [x] Postgres 离线 DDL（`--sql`）渲染出合法 Postgres SQL（VARCHAR/JSON/BOOLEAN/CREATE INDEX），证明迁移跨库兼容
- [x] SQLite dev 路径不受影响：`pytest tests/ -q` 70 passed，真实服务启动 + 对话正常
- [x] Postgres 时 Checkpointer 自动切 AsyncPostgresSaver（代码就位 + 降级路径；本环境无 Postgres 服务，未做真机连库验证）

**未做（诚实标注）：** 本机无 Postgres 服务，未做真实 Postgres 端到端连库验证（迁移已用离线 DDL + SQLite 真跑双重验证）；多副本部署、连接池调优、读写分离等运维层未覆盖。

---

## M13.6：安全加固 + 生产启动校验（生产化硬缺口，已完成）

**动机**：几个上生产前必须堵的口子——计算器用 `eval()`（任意代码执行/幂运算 DoS）、
天气工具关闭了证书校验（中间人攻击）、删除/转账等高危工具默认就加载给 Agent、
生产配置不安全（默认 SECRET_KEY 可伪造 JWT）也能照常启动。

**做了什么：**
1. **去 eval()**（`app/core/safe_tools.py::safe_eval_math`）：AST 白名单求值替代 `eval`，
   显式不含 `**`（防 `9**9**9` 打满 CPU），禁变量/函数调用/属性。MCP 主路径
   `utils_server.calculator` 与内嵌 fallback `_calculator_fallback` 都换成它。
2. **恢复证书校验**（`safe_tools.secure_ssl_context`）：用 certifi CA 包的 `create_default_context`
   替代 `ssl._create_unverified_context()`。`weather_server` 与内嵌天气 fallback 都改。
3. **高危工具默认门禁**（`config.ALLOW_DANGEROUS_TOOLS=False` + `loader` 过滤 `_dangerous` server）：
   删除/转账工具默认不加载，Agent 无法自主调用；需演示 HITL 时显式开启。
4. **生产启动校验**（`config.validate_runtime()` + `main.py` lifespan 调用）：
   `ENVIRONMENT=production` 时，SECRET_KEY 为默认/空值 → **拒绝启动**；DEBUG=True /
   AUTH_SECRET 空 / 配额白名单含 `*` / 高危工具开启 → 打印警告。开发环境不打扰。

**可验收：**
- [x] `safe_eval_math`：正常计算对、`9**9**9` 幂运算被拒、代码注入被拒、除零报错（单测覆盖）
- [x] `secure_ssl_context` 的 `verify_mode==CERT_REQUIRED`、`check_hostname==True`
- [x] 计算器工具真实调用返回正确结果（走 MCP 主路径，已用真实请求验证 `(3+5)*12=96`）
- [x] 高危工具默认不加载：`_load_config()` 不含 `dangerous`；真实请求让 Agent 删数据时它无该工具可用
- [x] 生产 + 默认 SECRET_KEY → `validate_runtime()` 抛 RuntimeError 拒绝启动；开发环境静默
- [x] 全量 `pytest tests/ -q` 81 passed

**未做（诚实标注）：** 请求级限流（RPS）未做；高危工具目前是"默认禁用"门禁，未做完整的
LangGraph `interrupt()` 人审闭环（那属更大的 HITL 里程碑）。

---

## 企业级对标补全（M14–M19，对照 DeerFlow / noah-chat-svc）

> 来源：与 `bytedance/deer-flow`（可嵌入 harness，HITL/记忆/配置热更新等有生产级实现）
> 和 `noah-chat-svc`（企业级中台，内容安全/KMS/智能路由等）对比后，筛出"通用 + 学习价值高"的能力。
> **不嵌 DeerFlow 作为依赖**（它是整套并行架构，会和本项目冲突），而是照它的思路在本项目自己实现。
> DeerFlow 能当参照的：HITL、长期记忆、配置热更新、文件转换、secret 卫生、guardrail 骨架、编码 agent 沙箱。

### 草案总览（难易 + 优先级）

| 里程碑 | 内容 | 难度 | 优先级 | 状态 |
|--------|------|------|--------|------|
| M14 | HITL 人审 + 内容安全 | 🟡 中 | — | ✅ 已完成 |
| M15 | 请求级限流 + 配置热更新分级 | 🟢 低 | ⭐⭐⭐ 高 | ✅ 已完成 |
| M16 | 长期记忆 + 文件处理链路 | 🔴 高 | ⭐⭐ 中 | 草案 |
| M17 | 企业基建（密钥/指标/智能路由/富文本） | 🟡 中（分项） | ⭐ 低 | 草案 |
| M18 | 定时任务 + MCP 双层 JSON 兼容 | 🟡 中 | ⭐⭐ 中 | 草案 |
| M19 | 本地编码 Agent（AI Coding，学习版） | 🟡 中（生产版 🔴 高） | ⭐⭐⭐ 中高 | 草案 |

> 建议顺序：~~M15（已完成）~~ → **M19（最有意思、串联已有能力，下一个）** → M18 → M16 → M17（按需）。

## M14：HITL 人审闭环 + 内容安全（安全刚需，已完成）

### 子目标 A：HITL 人审闭环（参照 DeerFlow ClarificationMiddleware）

**要解决的问题**：高危工具（转账/删数据）目前是"默认禁用"（M13.6），要么完全不能用、要么完全放开。
生产需要的是"能用但每次执行前必须人工确认"。

**设计思路：**
- 用 LangGraph `interrupt()`：给"需审批"的工具套一层审批包装器（主进程内，dangerous 工具经 MCP adapter 也是 BaseTool，可包装），调用前 `interrupt({tool, args})` 暂停图。
- 暂停后 `stream()` 检测到中断 → 发 `approval_required` 事件（工具名 + 参数），任务进入等待态。
- 前端渲染"人审卡片"（批准/拒绝）→ `POST /chat/tasks/{id}/approve {decision}`。
- 背景任务 `_run_agent_task`（M12）已和 HTTP 解耦，是等待审批 + `Command(resume=decision)` 恢复的天然位置。
- 批准 → 执行真实工具；拒绝 → 注入"已被用户拒绝"的 ToolMessage，图继续。
- 配置 `HITL_ENABLED` / `HITL_APPROVAL_TOOLS`（默认含 transfer_money、delete_all_data）。

**可验收：**
- [x] 调用需审批工具时，执行前暂停并发 `approval_required`，不直接执行（真实 LLM 实测：transfer_money → 暂停）
- [x] 批准后工具真实执行并把结果接回对话（实测 approve → tool_result → 最终回答）；拒绝后工具不执行（单测覆盖）
- [x] 超时/未审批不会永久卡死（`wait_approval` 超时兜底）；`approval_required` 写入 run_events 可回放
- [x] 单测覆盖：批准路径 / 拒绝路径 / 非审批工具不受影响（tests/test_hitl.py）

### 子目标 B：内容安全（PII 脱敏 + 敏感词，参照 DeerFlow InputSanitization 骨架 + noah-chat-svc）

**要解决的问题**：用户输入可能含手机号/身份证/银行卡等 PII，直接送 LLM/存库有合规风险；也可能含需拦截的敏感词。

**设计思路：**
- 新增 `app/core/content_safety.py`：
  - `mask_pii(text)`：正则脱敏手机号/身份证/银行卡/邮箱（保留尾号，如 `138****8888`）。
  - `scan_sensitive(text)`：本地词表命中检测（预留 `provider` 接口，未来可接阿里云 Green）。
  - `check_input(text)`：返回 `(allowed, masked_text, hits)`。
- 送 LLM 前对用户输入做脱敏；命中拦截词直接拒绝（返回友好提示，不进 LLM）。
- 在 `agent.stream()` 入口接入；落库前也用脱敏后的文本。
- 配置 `CONTENT_SAFETY_ENABLED`、敏感词表可配。

**可验收：**
- [x] 手机号/身份证/银行卡/邮箱在送 LLM 前被脱敏；落库（create_task）也用脱敏后文本
- [x] 命中拦截词的输入被拒绝，返回友好提示，不调用 LLM（实测 banned_demo → error）
- [x] 关闭开关时行为不变；单测覆盖脱敏/拦截/放行三类（tests/test_content_safety.py）

---

## M15：请求级限流 + 配置热更新（韧性与运维，已完成）

### 子目标 A：请求级限流（RPS）
- `app/core/rate_limit.py`：进程内**滑动窗口**限流中间件（不引 slowapi），按 user_id（鉴权后）/ IP 限流，是配额之外的第二道闸。
- 中间件排在 Auth 内层 → 能读到真实 user_id；超限返回 429 + `Retry-After`；阈值 `RATE_LIMIT_*` 可配、支持热更新。
- 默认关闭（dev 宽松），生产建议开启，`validate_runtime` 未开时给警告。
- **可验收：**
  - [x] 同一 key 高频请求触发 429（实测 阈值3 → `200 200 200 429 429`）
  - [x] `/health` 等非 `/api/` 路径不限流；正常请求不受影响
  - [x] 阈值可配；关闭开关时无限流（单测 + 实测）

### 子目标 B：配置热更新 + 字段分级（参照 DeerFlow reload_boundary）
- `app/core/config_reload.py`：`RESTART_ONLY_FIELDS`（DATABASE_URL/ENVIRONMENT/SECRET_KEY/CORS）+ `reload_hot_config()`。
- 原理：`settings` 是单例，各处调用时读取；热更新 = 重读 .env → 只把热字段原地 setattr 回单例；重启字段变更只提示不应用；密钥字段报告里打码。
- 端点：`GET /api/v1/admin/config`（字段分级，只给名字）、`POST /api/v1/admin/config/reload`（触发），生产要求 admin、dev 放行。
- **可验收：**
  - [x] 改热字段（如 OPENAI_MODEL）reload 后即生效，无需重启（单测）
  - [x] 改重启字段（DATABASE_URL）只进 `needs_restart`、不原地应用（单测）
  - [x] 密钥字段（OPENAI_API_KEY）在报告里打码为 `***(changed)`
  - [x] 端点实测：`restart_only=[CORS_ORIGINS,DATABASE_URL,ENVIRONMENT,SECRET_KEY]`，25 个热字段

---

## M16：长期记忆 + 文件处理链路（重能力，草案 · 先设计不实现）

### 子目标 A：长期记忆（参照 DeerFlow Memory，用本项目自己的表）
- 事实抽取（LLM）+ 每用户隔离存储 + 注入系统提示 + 过期修剪（staleness）。
- 数据模型 `UserMemory`（user_id、facts[]、context 摘要）；异步防抖更新队列。
- **可验收**：多轮后能记住用户偏好并在新会话注入；按 user_id 隔离；可关可清。

### 子目标 B：文件处理链路（参照 DeerFlow uploads + markitdown）
- 上传 → 自动转换（PDF/PPT/Excel/Word → markitdown）→ 供 Agent 读取/预览。
- 抽象一个 `Storage` 接口（本地实现 + 预留 S3/MinIO），不写死本地盘。
- **可验收**：上传 PDF/Word 能被转成文本供问答；存储层可切换实现；大小/类型校验。

---

## M17：企业基建对接（偏运维/前端，按需，草案 · 先设计不实现）

- **密钥管理**：先做 secret 卫生（密钥不进日志/trace/响应），KMS 加解密留接口。
- **指标/APM/告警**：接 Prometheus `/metrics`（请求量/时延/token/成本），可选 Sentry 错误上报。
- **智能路由**：LLM 判意图分流（如"闲聊 vs 定时任务 vs 检索"），参照 noah-chat-svc。
- **富文本渲染**：前端补 KaTeX 公式 / mermaid 图 / Office 预览（纯前端）。
- **可验收**：按各子项单独定义（优先级最低，学习价值有限，视需要再展开）。

---

## M18：定时任务 + MCP 双层 JSON 兼容（草案 · 先设计不实现）

> 来源：对照 `crm-ai-h5` 最新 master（MOT-350 Scheduled、`8b9d0ab`）筛出的两条**有工程学习价值**的点。
> 本节仅为设计草案，尚未实现；实现前需再确认范围与优先级。

### 子目标 A：定时任务 Scheduled（借鉴 crm-ai-h5 MOT-350）

**要解决的问题**：目前 Agent 只能「用户发一条 → 立即跑一次」。定时任务让 Agent 能
**按计划（cron / 一次性延时）自动运行**，并在 UI 上有「运行面板」看每次运行的生命周期。

**设计思路（待定）：**
- **数据模型**：新增 `ScheduledTask`（id、session_id、user_id、cron 表达式或 next_run_at、prompt/agent_key、enabled、last_run_at、状态），每次触发复用现有 `AgentRun`/`AgentEvent` 记录运行。
- **调度器**：进程内用 `asyncio` 定时循环（学习项目够用，不引 Celery/APScheduler）；在 lifespan 启动一个后台 tick 协程，扫到期任务 → 复用 M12 的任务化流式内核（`task_stream.py`）后台跑。
- **API**：`POST /scheduled`（建）、`GET /scheduled`（列）、`DELETE /scheduled/{id}`、`GET /scheduled/{id}/runs`（运行历史）。
- **前端**：Runs 面板 + 响应内 `scheduled_task_card` 卡片（复用 `ToolCallBlock` 的卡片式渲染思路）。
- **护栏**：单任务并发上限、最大运行时长、失败重试上限、禁止无限自触发。

**开放问题**：cron 解析要不要引依赖（croniter）还是只支持固定间隔？多副本部署时的调度去重（学习项目暂单机，先不解决）。

**可验收（待实现后勾选）：**
- [ ] 能创建一个「每 N 分钟/指定时间」运行的任务，到点自动触发并产生 `AgentRun`
- [ ] Runs 面板能看到每次运行的状态与事件流；任务可启停/删除
- [ ] 有并发/时长/重试护栏，异常任务不会打满资源

### 子目标 B：MCP 双层 JSON 工具结果兼容（借鉴 crm-ai-h5 `8b9d0ab`）

**要解决的问题**：部分 MCP server 返回的工具结果，其 `content` 里的 `text` **本身又是一段 JSON 字符串**（结果被包了两层）。我们后端 `on_tool_end` 目前只取 `tool_output.content`，前端也只做了「内容块数组抽 text」（M12 修的 `[object Object]`），**没有处理再套一层 JSON 的情况**——这类结果在 UI 上会显示成一坨转义 JSON 字符串，而不是结构化内容。

**设计思路（待定）：**
- 后端 `agent.py` 的 `on_tool_end`：对工具输出做一次「尝试解析内层 JSON」——若 `text` 能 `json.loads` 成 dict/list，则解析后作为结构化 `data` 一并下发（保留原始文本兜底）。
- 前端 `ToolCallBlock`：优先渲染结构化 `data`，无则回退当前的文本展示。
- 需要一个开关/白名单，避免把「本来就是普通字符串、恰好长得像 JSON」的输出误解析。

**开放问题**：是否所有 MCP server 都有此问题，还是个别？需要先抓一个真实双层 JSON 的样本再定解析策略（避免过度设计）。

**可验收（待实现后勾选）：**
- [ ] 对返回双层 JSON 的 MCP 工具，UI 能展示解析后的结构化内容，而不是转义字符串
- [ ] 普通字符串输出不受影响（不误解析）
- [ ] 有单测覆盖：双层 JSON / 普通字符串 / 内容块数组三种形状

---

## M19：本地编码 Agent（AI Coding，草案 · 先设计不实现）

> 来源：对标「Noah AI Coding / Claude Code」这类 AI 编码 agent（读代码库 → 规划 →
> 改代码 → 跑测试，带人审门）。价值在于把已有能力（HITL / 工具 / 流式 / 记忆）串成
> 一条真实的「agent 改代码」链路。**先做本地学习版，不碰生产级沙箱/多项目/远程仓库。**

**要解决的问题**：目前 Agent 只能查天气/算数，不能读改一个真实代码仓库。编码 agent
让它能在**指定本地目录**里读文件、改文件、跑命令，并在写文件/执行命令前经过人审门。

**为什么这个项目适合做**（地基已就绪）：
- Agent 循环、工具框架（MCP + @tool）、流式、Checkpoint 记忆 —— 都有。
- **M14 HITL `interrupt()` 审批门 = 编码 agent 的 HARD-GATE**：写文件/跑命令前弹审批卡片，直接复用。
- MCP 架构可**挂官方 filesystem server**，加文件工具接近零代码。

**设计思路（学习版）：**
- **文件工具**：`read_file` / `write_file` / `str_replace` / `list_dir` / `glob` / `grep`
  —— 优先挂 MCP 官方 filesystem server；工作目录限定在配置的 `CODE_AGENT_WORKSPACE`（防越权）。
- **Shell 工具**：`bash`（跑 build/test/git）—— ⚠️ 安全面大，**默认纳入 HITL 审批名单**
  （复用 `HITL_APPROVAL_TOOLS`），且限定 cwd 在工作区；学习版用子进程 + 超时，不做完整沙箱。
- **代码导航**：先用 `grep`/`glob`；进阶可对代码做 RAG（复用 M9 思路）。
- **Plan-Execute**：新增 `code-agent`（catalog 第 10 个模式），系统提示词走
  「先读相关代码 → 出改动计划 → 等人确认（HARD-GATE）→ 逐文件改 → 跑测试自检」。
  可用 LangGraph 加一个 planner 节点或子 agent（参照 DeerFlow subagent，学习版先单 agent 提示词编排）。
- **工作区隔离**：每会话一个工作目录（复用 uploads 的 thread 级目录思路）。

**明确不做（留给生产版/DeerFlow 级）**：安全沙箱（Docker 隔离任意代码执行）、
GitLab PAT 凭证管理与远程 clone/PR、多项目管理 UI、大仓库上下文工程、工作流引擎。

**开放问题**：`bash` 工具的安全边界（学习版靠 HITL 审批 + cwd 限定 + 超时，够不够？）；
写文件的 diff 预览与撤销；大仓库如何喂上下文（grep vs code RAG）。

**可验收（待实现后勾选）：**
- [ ] 能让 Agent 在 `CODE_AGENT_WORKSPACE` 里读文件、按指令改一个文件、跑一条测试命令
- [ ] 写文件 / 跑 bash 前弹 HITL 审批卡片，拒绝则不执行（复用 M14）
- [ ] 文件/命令操作被限定在工作区内，越权路径被拒绝
- [ ] 有一条端到端 demo：给一个小需求 → Agent 出计划 → 批准 → 改代码 → 测试通过
- [ ] 单测覆盖：路径越权拦截 / bash 超时 / 审批拒绝路径

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
| **工具工程** | 工具 description 怎么写？annotations 四字段含义？ | `weather_server.py` docstring + ToolHive 最佳实践 | M4 |
| **异步并发** | 为什么 LLM 调用必须 async？依赖注入怎么隔离请求？ | `chat.py` 的 `Depends(get_db)` + `database.py` | M1 |
| **鉴权安全** | Bearer 中间件 + ContextVar 隔离？多用户 JWT/bcrypt 怎么做？ | `auth.py`（Bearer+JWT）+ `security.py`（bcrypt/HS256） | M5 / M13 |
| **可观测** | trace_id 怎么贯穿全链路？Langfuse vs LangSmith？ | `trace.py` 中间件 + `tracing.py` Langfuse metadata | M6 / M12 P1 |
| **评测** | trajectory eval 是什么？怎么防止 prompt 改了能力退化？ | `eval/run_eval.py`（10 用例 + 4 断言） | M7 |
| **RAG** | 向量检索 + 引用可解释？chunking 策略？ | `core/rag.py`（ChromaDB + 引用标注） | M9 |
| **Multi-Agent** | Sequential / Parallel / Supervisor 适用场景？ | `agents/multi/team.py` 四种模式实现 | M3 |
| **AI 测试** | LLM 输出非确定性怎么测？RAG 命中率怎么验证？ | `app/core/ai_testing.py` 六种测试类型 | M11 |
| **流式协议** | SSE vs NDJSON？断线续传/事件重放怎么做？ | `chat.py::/tasks` + `task_stream.py` + `useResumableStream.ts` | M2 / M12 P2 |
| **架构守护** | 怎么防止核心层反向依赖业务层？ | `tests/test_harness_boundary.py`（AST 静态检查） | M12 P1 |
| **DB 迁移/扩展** | create_all vs Alembic？怎么支持水平扩展？ | `migrations/` + `database.py` 分方言 + `checkpointer.py` | M13.5 |
| **生产安全** | eval 为什么危险？高危工具怎么门禁？启动校验查什么？ | `safe_tools.py` + `loader` 门禁 + `config.validate_runtime` | M13.6 |
| **系统设计** | 设计一个支持 10w QPS 的 Agent 服务？ | 整体架构图（docs/ARCHITECTURE.md） | 综合 |

### 6.3 学习游戏接入规划

面试题以新关卡类型接入 learn-game（当前均已完成）：

```
docs/learn-game/data/
  ├── m0.js ... m9.js              ← 学习关卡（已有，10 个）
  ├── interview-agent.js           ← 面试题：Agent 核心（15 题）✅
  ├── interview-advanced.js        ← 面试题：进阶（13 题）✅
  ├── interview-engineering.js     ← 面试题：工程深入（12 题）✅
  ├── interview-realbugs.js        ← 面试题：真实踩坑（5 题）✅
  ├── interview-runtime.js         ← 面试题：生产 Runtime（6 题）✅
  ├── interview-testing.js         ← 面试题：AI 测试（8 题）✅
  ├── interview-production.js      ← 面试题：生产化进阶 Trace/断线续传/JWT/Postgres/安全（8 题）✅
  └── levels.js                    ← 注册所有关卡（LEVELS_ALL）
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

## 7. 时间安排建议（不强求）

学习项目不宜定死时间，但可以参考节奏：

- **本周**：M4 完成（MCP 接入）
- **下周**：M5 完成（Checkpoint + 预算）
- **后续**：M6/M7 并行推进（可观测和评测互相依赖）
- **面试题库**：学习关卡和里程碑推进过程中，穿插做面试题（不单独排时间）

---

## 8. 自检清单

学完每个 M，问自己 3 个问题：
1. **能不能给一个不熟悉的人讲清楚这个技术解决什么问题？**
2. **能不能不看任何文档，复现核心代码？**
3. **能不能在自己的项目里独立用上？**

三个都"能"才算掌握。

---

> 内容根据公开搜索结果做了改写以符合引用规范
