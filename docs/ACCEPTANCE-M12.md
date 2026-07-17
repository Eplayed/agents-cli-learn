# M12 验收清单（自助验收）

本文档给出 M12 里程碑各项功能的**可自行执行的验收步骤**，含命令、预期结果和勾选框。
勾选框留空，供你逐项核对后自行打勾。

M12 已完成的三块：
- **P0**：工具调用人话翻译 + 流式工具卡片状态化
- **P1**：全链路 Trace-ID + Harness/App 架构守护测试
- **P2**：流式断线续传（任务化 SSE + 事件重放，即「改法 B」）

> 诚实说明：下方标注 ⚠️ 的条目是「代码就位但未做运行时验证」或「需要真实浏览器/外部依赖」，
> 请按提示自行补验。

---

## 0. 准备环境

```bash
# 后端（终端 A）
cd apps/api
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
# 看到 "Application startup complete." 即就绪

# 前端（终端 B，需要看 UI 时才启）
cd apps/web
npm run dev
# 打开 http://localhost:3000/ui/
```

- 需要真实模型回答时，确保 `.env.dev` 里配了可用的 `OPENAI_API_KEY`（及可选 `OPENAI_BASE_URL`）。
- 未配 key 时，对话会返回「API Key 未配置」引导卡片——协议链路仍可验证，只是没有真实回答。

健康检查：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/health   # 期望 200
```

- [ ] 后端启动成功，`/health` 返回 200

---

## 1. 回归基线（先确认没破坏既有功能）

```bash
# 后端全量测试
cd apps/api && .venv/bin/python -m pytest tests/ -q          # 期望 62 passed

# 前端构建（含类型检查）
cd apps/web && npm run build                                 # 期望 built 成功、无 TS 报错
```

- [ ] 后端 `pytest tests/ -q` 全绿（当前基线 **62 passed**）
- [ ] 前端 `npm run build` 通过（`vue-tsc --noEmit && vite build`）

---

## 2. P0 — 工具调用人话翻译 + 流式工具卡片状态化

### 2.1 后端协议（命令行）

```bash
curl -s -N -X POST http://localhost:8000/api/v1/chat/stream_ndjson \
  -H "Content-Type: application/json" \
  -d '{"message":"上海今天天气怎么样","stream":true}' \
  | grep -o '"type": "[a-z_]*"\|"name": "[a-zA-Z_]*"' | head
```

预期：出现 `tool_calls`（name `get_weather`）→ 对应 `tool_result`（同名 `get_weather`）→ 若干 `text` → `token_stats`。

- [ ] 后端对天气类问题会发出 `tool_calls` 且随后有同名 `tool_result`（同名配对成立）

### 2.2 前端 UI（浏览器）

在 `http://localhost:3000/ui/` 发一句会触发工具的话（如「上海今天适合洗车吗」）：

- [ ] 工具卡片标题显示**中文名**（如「查询天气」），不是 `get_weather`
- [ ] 工具执行时卡片是**转圈 + 实时耗时秒数**（running），结果回来后**同一张卡片**变成 ✓ 调用完成（done），不新增重复的结果卡片
- [ ] 展开卡片能看到「原始工具名」和工具输出
- [ ] 触发 Skills/RAG 时的 `[Skills 激活: xxx]` / `[RAG 检索]` 这类提示不会永久转圈
- [ ] ⚠️ 未登记映射的新工具，前端应 fallback 显示原始工具名（需你新增一个未在 `toolDisplay.ts` 中的工具来验证）

---

## 3. P1 — 全链路 Trace-ID + 架构守护

### 3.1 架构守护测试

```bash
cd apps/api && .venv/bin/python -m pytest tests/test_harness_boundary.py -v
```

- [ ] `test_core_layer_does_not_import_app_layer` 通过（核心层 `app/agents`、`app/core` 不反向 import `app.api`/`app.main`）
- [ ] `test_core_layer_has_files_to_check` 通过（确实扫到了文件，非空跑）

### 3.2 Trace-ID 响应头

```bash
# 不带入站头：应自动生成
curl -s -D - -o /dev/null http://localhost:8000/health | grep -i "x-trace-id\|x-request-id"

# 带入站 X-Trace-Id：应原样复用回传
curl -s -D - -o /dev/null -H "X-Trace-Id: my_trace_123" \
  http://localhost:8000/api/v1/models | grep -i "x-trace-id"
```

- [ ] 每个响应都带 `X-Trace-Id` 与 `X-Request-Id`
- [ ] 入站 `X-Trace-Id` 被原样复用回传（值为 `my_trace_123`）
- [ ] 连续两次请求（不带头）生成的 `X-Trace-Id` 不同

### 3.3 结构化日志带 trace

观察后端（终端 A）的日志输出，应形如：

```
10:39:45.669 | INFO    | trace=trace_xxx req=req_xxx | --> GET /health
10:39:45.683 | INFO    | trace=trace_xxx req=req_xxx | <-- 200 GET /health 14.4ms
```

- [ ] 请求首尾各有一条日志，且带 `trace=` / `req=`，与响应头里的 ID 一致

### 3.4 Langfuse 关联 ⚠️（未运行时验证）

- [ ] ⚠️ 代码已把同一 `trace_id` 写进 Langfuse callback 的 `metadata`/`tags`（见 `app/core/tracing.py`）。
  需自行在 `.env.dev` 配 `LANGFUSE_PUBLIC_KEY/SECRET_KEY/HOST`，发一次对话，
  再去 Langfuse 后台确认 trace 详情页的 metadata 里有 `trace_id`。

---

## 4. P2 — 流式断线续传（任务化 SSE + 事件重放）

### 4.1 单元 / 端点测试

```bash
cd apps/api && .venv/bin/python -m pytest tests/test_task_stream.py tests/test_chat_tasks.py -v
```

- [ ] `test_task_stream.py`：从头重放 / `after_id` 跳过 / 在线跟随 / 已完成即时返回 / TTL 回收 全过
- [ ] `test_chat_tasks.py`：创建任务 / 观察到 done / `after_id` 首帧 reconnect / 未知任务 error+done / SSE id 单调递增 全过

### 4.2 真实断线续传（命令行，需真实 key 才有多个 token）

```bash
# 1) 建任务，拿到 task_id
TID=$(curl -s -X POST http://localhost:8000/api/v1/chat/tasks \
  -H "Content-Type: application/json" \
  -d '{"message":"用一句话说你好","stream":true}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['task_id'])")
echo "task_id=$TID"

# 2) 首次观察：应看到 event: open，然后 id: 1 / 2 / 3 ... 逐条 message，最后 done
curl -s -N "http://localhost:8000/api/v1/chat/tasks/$TID/stream" | head -14

# 3) 重连续传：从 id 2 之后接着收（首帧应为 event: reconnect，跳过前 2 个事件）
curl -s -N "http://localhost:8000/api/v1/chat/tasks/$TID/stream?after_id=2" | head -8
```

预期第 3 步首帧为 `event: reconnect`，且数据流从 `id: 3` 开始（前两个事件被跳过）。

- [ ] `POST /chat/tasks` 返回 `task_id` 和 `session_id`
- [ ] 首次 `GET .../stream` 首帧是 `event: open`，随后事件带单调 `id:`，以 `done` 结束
- [ ] 带 `?after_id=2` 重连时首帧是 `event: reconnect`，数据从 `id: 3` 续上（事件重放/断线续传成立）
- [ ] 用 `Last-Event-ID` 请求头代替 `?after_id=` 也能续传（`-H "Last-Event-ID: 2"`）
- [ ] 未知/过期 task_id：`curl -s -N http://localhost:8000/api/v1/chat/tasks/task_bogus/stream` 返回 error + done，不会挂起

### 4.3 浏览器真实断网重连 ⚠️（需手动）

- [ ] ⚠️ 在浏览器发起一次较长回答的对话，中途用 DevTools 的 Network → Offline 断网几秒再恢复，
  确认前端能自动重连并从断点续接（`useResumableStream.ts` 最多重连 5 次、带退避）。
  这一项后端机制已验证，UI 层的自动重连需你手动断网复现。

---

## 5. 提交与文件对照

- 相关提交：
  - `M12 P0`：工具调用人话翻译 + 流式工具卡片状态化
  - `M12 P1`：全链路 Trace-ID + Harness/App 架构守护
  - `M12 P2`：任务化 SSE + 事件重放（改法 B）
- 关键文件：
  - 后端：`app/core/task_stream.py`、`app/core/trace.py`、`app/api/v1/chat.py`、`app/core/tracing.py`
  - 前端：`apps/web/src/composables/toolDisplay.ts`、`useResumableStream.ts`、`components/ToolCallBlock.vue`、`stores/chat.ts`
  - 测试：`tests/test_harness_boundary.py`、`test_trace.py`、`test_task_stream.py`、`test_chat_tasks.py`
- 详细设计与取舍见 `LEARNING-PLAN.md` 的 M12 章节。
