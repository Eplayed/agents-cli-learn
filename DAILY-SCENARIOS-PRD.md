# 日常对话场景能力（PRD）

## 1. 背景与问题

当前 Web UI 的日常对话里出现了“工具有调用，但用户看不出工具返回了什么、也无法得到可用结论”的情况。例如用户问“上海天气适宜洗车吗”，界面能看到 `tool_calls: get_weather / search_web`，但 `tool_result` 缺少输出内容，导致：
- 用户无法确认是否真的查到了天气数据
- Agent 无法基于工具结果给出“可执行”的建议
- 学习者无法理解一次对话背后的真实运作链路（函数/接口/工具）

## 2. 目标（Goals）

1) **场景可用**：对“天气 + 洗车建议”这类高频日常问题给出可靠、可复核的输出。  
2) **过程可解释**：在会话日志中一目了然地看到：走了哪些核心函数/方法、命中了哪些工具、每一步耗时与输入输出。  
3) **可学习**：把“Agent 的思考链路 + 工具调用链路 + 后端接口链路”可视化与可导出，便于复盘。  

## 3. 范围（Scope）

### 3.1 本期范围（MVP）
- 场景能力：**天气查询 + 洗车建议**
- 工具层：`get_weather(city)` 能返回结构清晰的天气摘要（气温/降雨概率/风速/降水量）与建议
- 日志层：在单次对话 Trace 中展示“运作流程”（UI → API → 后端核心函数 → 工具）
- 可观测性：工具调用的 **名称 + 参数 + 输出** 可在 UI 中看到
- 导出：会话日志 JSON/文本导出

### 3.2 暂不做（Non-goals）
- 复杂的城市歧义消解（同名城市/区县级）
- 账户体系/多用户隔离
- 生产级权限/审计（学习项目后续再做）

## 4. 用户故事（User Stories）

### 4.1 学习者（核心用户）
- 作为学习者，我希望看到一次“问天气”的完整链路：点击发送 → 调用哪个 API → 后端执行哪些核心函数 → 调了哪些工具 → 工具输出是什么 → 最终回答如何生成。
- 作为学习者，我希望能导出这次对话的日志（JSON/文本），回放并写学习笔记。

### 4.2 日常使用者
- 作为普通用户，我只想得到一个明确结论：“今天上海是否适合洗车，为什么？”并能看到关键数据（降雨概率/风速）。

## 5. 交互与界面（UX）

### 5.1 对话区
- 用户输入：自然语言
- Assistant 输出：结论优先（适合/不适合 + 1–3 条依据），然后附天气摘要
- 工具调用展示：可折叠（默认收起），展开后看到：
  - tool name
  - tool input（参数）
  - tool output（结果摘要/原文）

### 5.2 会话日志（Trace 视角）
每次点击发送生成一个 Trace，Trace 顶部固定显示：
- 运作流程（串联 UI/API/后端核心函数/工具）
- 使用工具列表（Tools: ...）
- 关键耗时（总耗时与主要 span 耗时）

示例（展示意图）：
- `UI: ui:sendStream → UI: fetch POST /api/v1/chat/stream_ndjson → backend: chat_stream_ndjson() → backend: SingleAgent.stream() → backend: ToolNode(get_weather) → backend: ChatOpenAI(stream)`

## 6. 功能需求（Functional Requirements）

### FR-1 天气工具输出必须可见
- `tool_calls` 事件必须包含：`name` + `input`
- `tool_result` 事件必须包含：`name` + `output`
- UI 必须把 tool output 以可读方式展示（默认收起，展开可看全文）

验收标准：
- 任何一次工具调用都能在 UI 中看到参数与结果（不再出现只有 `done: true` 的情况）。

### FR-2 “天气 + 洗车”场景回答质量
当用户询问“城市 + 今天/明天 + 是否适宜洗车”时：
- Agent 必须调用 `get_weather(city)` 获取天气关键字段
- 必须输出一个明确结论（建议/不建议/观望），并说明依据
- 若天气数据不完整，必须给出降级策略（例如提示查看未来 6 小时降雨雷达）

验收标准：
- 对输入“今天上海天气怎么样，适宜洗车吗？”能输出包含：
  - 气温区间
  - 降雨概率
  - 风速（或说明缺失）
  - 洗车建议与理由

### FR-3 会话日志“运作流程”摘要
每条 Trace 顶部必须生成一段摘要：
- UI 入口（sendOnce/sendStream/switchSession/newSession）
- API 路径（/api/v1/chat/..., /api/v1/team/..., /api/v1/session/summary 等）
- 关键后端函数（chat_send/chat_stream_ndjson/team_execute/team_stream_ndjson 等）
- 关键 Agent/框架方法（SingleAgent.stream / MultiAgentTeam.execute_* / LangGraph astream_events）
- 工具列表（tool:call 的 name）

验收标准：
- 不看明细日志，仅看摘要即可复述这次操作的关键链路。

### FR-4 日志可导出与可复盘
- JSON 导出：包含 sessionId、traceId、ts、level、kind、name、data
- 文本导出：按时间顺序输出

验收标准：
- 导出文件可被再次导入/解析（后续可扩展“导入回放”）。

## 7. 数据与协议（Data Contract）

### 7.1 工具事件（前端展示）
建议统一为：
```json
{ "type": "tool_calls", "data": { "name": "get_weather", "input": { "city": "上海" } } }
{ "type": "tool_result", "data": { "name": "get_weather", "output": "..." } }
```

### 7.2 天气工具输出格式（建议）
短期允许输出纯文本；中期建议输出 JSON（便于 UI 结构化展示），例如：
```json
{
  "city": "Shanghai",
  "temp_min": 18,
  "temp_max": 26,
  "precip_probability_max": 60,
  "windspeed_max": 11,
  "car_wash_advice": "不建议",
  "reasons": ["降雨概率较高", "风较大"]
}
```

## 8. 错误处理与降级
- 工具失败（超时/城市找不到）：必须返回可读错误字符串，并在日志中标记 ERROR
- 模型未调用工具就给结论：需要在 system prompt 或路由层做引导（“遇到天气类问题必须先调用工具”）
- 外部数据不可用：降级为“无法获取实时数据 + 给出通用建议 + 建议用户看哪类信息”

## 9. 里程碑（建议拆分）
- M1：工具输出可见（tool input/output）+ 日志摘要流程
- M2：天气工具真实数据（无 key 依赖）+ 洗车建议结构化
- M3：后端 Trace 透传（X-Trace-Id + 真实函数打点）实现端到端“真实调用树”

