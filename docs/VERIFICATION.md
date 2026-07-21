# 全功能验证清单（Verification Checklist）

覆盖项目**全部功能**的可执行验证列表：自动化测试（最快广覆盖）+ 逐功能手动验证。
每项含 **命令/操作 + 预期结果 + 勾选框**，逐项打勾即可完成一次完整回归。

> 标注说明：
> - ⚠️ **需真实 API Key**：`.env.dev` 配好 `OPENAI_API_KEY`（可配 `OPENAI_BASE_URL` 用国内代理）
> - 🌐 **需浏览器**：在 `http://localhost:8000/ui` 手动操作
> - 🧩 **需额外依赖/服务**：RAG 库 / Postgres / Langfuse key 等
> - 其余为纯命令行/离线可验证

---

## 0. 环境与启动

```bash
# 启动（FastAPI 同时托管 API 和 /ui）
npm run dev
# 或：cd apps/api && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- [ ] 服务启动无报错，日志出现 `Application startup complete.`
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/health` → **200**
- [ ] 浏览器打开 `http://localhost:8000/ui` 能看到对话界面 🌐
- [ ] `http://localhost:8000/docs` 能打开 Swagger，端点齐全

---

## 1. 自动化测试（最快的广覆盖，先跑这个）

```bash
# 后端全量单测（当前基线 101 passed）
cd apps/api && .venv/bin/python -m pytest tests/ -q

# 全新 DB 验证 fresh-clone 无 no such table
rm -f /tmp/v.db; DATABASE_URL="sqlite+aiosqlite:////tmp/v.db" .venv/bin/python -m pytest tests/ -q; rm -f /tmp/v.db

# 前端构建（vue-tsc 类型检查 + vite build）
cd ../web && npm run build

# 评测回归（10 用例 + 4 断言）⚠️需 Key
cd ../api && .venv/bin/python -m eval.run_eval
```

- [ ] `pytest tests/ -q` → **101 passed**
- [ ] 全新 DB 下同样 **101 passed**（fresh-clone 测试债已修）
- [ ] `npm run build` 通过，无 TS 报错
- [ ] ⚠️ `eval.run_eval` 通过（或按其返回码判定）

---

## 2. 核心对话（单 Agent）⚠️

```bash
# NDJSON 流式（核心）
curl -s -N -X POST http://localhost:8000/api/v1/chat/stream_ndjson \
  -H "Content-Type: application/json" -d '{"message":"你好，一句话自我介绍","stream":true}' | head

# 非流式
curl -s -X POST http://localhost:8000/api/v1/chat/send \
  -H "Content-Type: application/json" -d '{"message":"1+1等于几"}'
```

- [ ] ⚠️ `/stream_ndjson` 逐行返回 `{"type":"text",...}`，最后 `token_stats` + `done`
- [ ] ⚠️ `/chat/send` 返回完整回答
- [ ] 🌐 UI 里发消息，流式逐字显示，Markdown 正常渲染
- [ ] 🌐 未配 Key 时 UI 显示"API Key 未配置"引导卡片（`config_error`）
- [ ] 🌐 生成过程中点"停止"能中断（AbortController）

---

## 3. Agent 模式与模型切换

```bash
curl -s http://localhost:8000/api/v1/agents      # 9 种 Agent
curl -s http://localhost:8000/api/v1/models       # 可用模型列表
```

- [ ] `/api/v1/agents` 返回 9 种（basic-chatbot / tool-agent / mcp-agent / multi-agent / hitl-agent / traced-agent / skills-agent / rag-agent / full-agent）
- [ ] `/api/v1/models` 返回模型列表
- [ ] 🌐 UI 下拉切换 Agent / 模型后对话生效

---

## 4. 工具调用（MCP + 可视化）⚠️

```bash
# 天气（真实 Open-Meteo）
curl -s -N -X POST http://localhost:8000/api/v1/chat/stream_ndjson \
  -H "Content-Type: application/json" -d '{"message":"上海今天适合洗车吗","stream":true}' \
  | grep -o '"type": "[a-z_]*"\|"name": "[a-zA-Z_]*"'
```

- [ ] ⚠️ 出现 `tool_calls`(get_weather) → 同名 `tool_result` → text
- [ ] ⚠️ 计算器：问"(3+5)*12 等于几"→ 调 calculator 返回 96
- [ ] 🌐 工具卡片显示**中文名**（"查询天气"），执行中转圈+实时耗时，完成变 ✓
- [ ] 🌐 展开工具卡片能看到**可读的工具输出**（不是 `[object Object]`）
- [ ] MCP 服务器齐全：weather(stdio) / utils(stdio) / time(HTTP) / dangerous（HITL 下加载）

---

## 5. Multi-Agent（4 模式）⚠️

```bash
curl -s -N -X POST http://localhost:8000/api/v1/team/stream_ndjson \
  -H "Content-Type: application/json" -d '{"topic":"写一段产品介绍","mode":"sequential"}' | head
```

- [ ] ⚠️ Sequential 模式返回 `agent_start` / `task_result` / `summary` 事件
- [ ] ⚠️ 其余模式可用：`parallel` / `supervisor` / `groupchat`（改 mode 参数）
- [ ] 🌐 UI 团队模式切换后能看到多 Agent 协作过程

---

## 6. 会话与历史（持久化）

```bash
# 创建会话
SID=$(curl -s -X POST http://localhost:8000/api/v1/session/ -H "Content-Type: application/json" -d '{}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
echo $SID
# 历史消息
curl -s "http://localhost:8000/api/v1/session/$SID/messages"
```

- [ ] 创建/删除会话正常（`POST /session/`、`DELETE /session/{id}`）
- [ ] `GET /session/{id}/messages` 返回历史（含 attachments 字段）
- [ ] **Checkpoint 持久化**：同一会话多轮对话，重启服务后仍记得上下文 ⚠️
- [ ] 🌐 UI 左侧会话列表可切换，历史消息正确回显

---

## 7. 多模态图片 ⚠️🌐

- [ ] 🌐 上传/粘贴/拖拽图片，Vision 模型能分析图片内容
- [ ] 🌐 图片落盘到 `uploads/<session_id>/`，历史消息里能重新看到图片
- [ ] 🌐 一次最多 3 张图片

---

## 8. Skills 技能商店

```bash
curl -s http://localhost:8000/api/v1/skills/local        # 内置
curl -s http://localhost:8000/api/v1/skills/installed    # 已安装
curl -s "http://localhost:8000/api/v1/skills/online-search?q=weather"  # GitHub 在线搜索 🌐
```

- [ ] `/skills/local` 返回内置 skill（weather-advisor / code-reviewer）
- [ ] `/skills/online-search` 从 GitHub 返回结果（🌐 需外网）
- [ ] 安装：`POST /skills/install` 写入 `skills/_installed/<slug>/SKILL.md`
- [ ] 启停：`POST /skills/{slug}/toggle`；卸载：`DELETE /skills/{slug}`
- [ ] ⚠️ Skills Agent 对话时，命中触发词的 skill 被激活（对话里出现 `[Skills 激活: ...]`）
- [ ] 🌐 SkillsView 页面：在线搜索 / 已安装 / 本地三栏正常

---

## 9. RAG 知识库 🧩⚠️（可选，默认关闭）

```bash
# 装重型依赖并开启
pip install -r apps/api/requirements-rag.txt
# .env.dev 设 ENABLE_RAG=true 后重启
```

- [ ] 🧩 开启后，RAG Agent 检索 `docs/*.md` 并在回答里带引用标注
- [ ] 关闭（默认）时不装 torch/chromadb，服务照常启动

---

## 10. AI 应用测试（6 类型）⚠️

```bash
curl -s http://localhost:8000/api/v1/ai-testing/types                 # 6 种类型
curl -s http://localhost:8000/api/v1/ai-testing/presets/tool_calling  # 预置用例
curl -s -X POST http://localhost:8000/api/v1/ai-testing/run \
  -H "Content-Type: application/json" -d '{"test_type":"tool_calling"}'  # 跑一次 ⚠️
curl -s http://localhost:8000/api/v1/ai-testing/history               # 历史
```

- [ ] `/types` 返回 6 种（prompt_stability / multi_turn / rag_hit_rate / tool_calling / hallucination / adversarial）
- [ ] ⚠️ `/run` 能跑并返回逐 case 结果 + 通过率
- [ ] `/history` 记录历史，`GET/DELETE /history/{id}` 可查看/删除
- [ ] 🌐 TestingView 页面：编辑 JSON 用例 / 运行 / 查看结果 / 历史

---

## 11. 多用户鉴权（JWT）

```bash
U="v_$RANDOM"
TOK=$(curl -s -X POST http://localhost:8000/api/v1/auth/register -H "Content-Type: application/json" -d "{\"username\":\"$U\",\"password\":\"secret123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOK"
```

- [ ] 注册 `/auth/register` 返回 JWT；重复注册返回 409
- [ ] 登录 `/auth/login`；错误密码返回 401
- [ ] `/auth/me` 带 JWT 返回真实用户身份；篡改 token 返回 401
- [ ] 不带 token 时（开发模式，AUTH_SECRET 空）为匿名放行
- [ ] 遗留 `AUTH_SECRET` 共享密钥仍兼容（设值后必须带 Bearer）

---

## 12. 配额与幂等

```bash
curl -s http://localhost:8000/api/v1/runs/quota     # 当前配额用量
```

- [ ] `/runs/quota` 返回每日 token 用量/上限
- [ ] ⚠️ 相同 `idempotency_key` 重复请求不重复执行（返回缓存/去重）
- [ ] 配额超限返回 429（`QUOTA_WHITELIST` 去掉 `*` 并调小 `QUOTA_DAILY_TOKENS` 验证）

---

## 13. 运行历史与事件溯源

```bash
curl -s "http://localhost:8000/api/v1/runs/?limit=5"   # 运行历史
curl -s "http://localhost:8000/api/v1/runs/<run_id>"   # 单次详情 + 事件
```

- [ ] `/runs/` 分页返回历史运行
- [ ] `/runs/{id}` 返回该次运行的完整事件流（AgentEvent 溯源）

---

## 14. 可观测（Trace-ID / Langfuse / Token）

```bash
# 响应头带 trace/req
curl -s -D - -o /dev/null http://localhost:8000/health | grep -i "x-trace-id\|x-request-id"
# 入站复用
curl -s -D - -o /dev/null -H "X-Trace-Id: my_trace_1" http://localhost:8000/api/v1/models | grep -i x-trace-id
```

- [ ] 每个响应带 `X-Trace-Id` / `X-Request-Id`
- [ ] 入站 `X-Trace-Id` 被复用；两次无头请求 trace_id 不同
- [ ] 后端日志为结构化格式，带 `trace=... req=...`，与响应头一致
- [ ] ⚠️ token_stats 事件带 token 数与成本估算
- [ ] 🧩 配了 Langfuse key 时，trace 详情页 metadata 含同一 trace_id（未配则跳过）

---

## 15. 流式断线续传（任务化 SSE）⚠️

```bash
TID=$(curl -s -X POST http://localhost:8000/api/v1/chat/tasks -H "Content-Type: application/json" -d '{"message":"用一句话说你好","stream":true}' | python3 -c "import sys,json;print(json.load(sys.stdin)['task_id'])")
curl -s -N "http://localhost:8000/api/v1/chat/tasks/$TID/stream" | head -14           # 首连 id:1,2,3...
curl -s -N "http://localhost:8000/api/v1/chat/tasks/$TID/stream?after_id=2" | head -8  # 重连从 id:3 续
```

- [ ] ⚠️ `POST /chat/tasks` 返回 `task_id` + `session_id`
- [ ] ⚠️ 首连 `GET .../stream` 首帧 `event: open`，事件带单调 `id:`，以 `done` 结束
- [ ] ⚠️ 带 `?after_id=2` 重连首帧 `event: reconnect`，从 `id:3` 续（跳过前 2）
- [ ] 未知 task_id：`GET .../tasks/bogus/stream` 返回 error + done，不挂起
- [ ] 🌐 UI 单 Agent 对话默认走这条路径

---

## 16. 安全加固（M13.6）

```bash
# 生产启动校验：默认 SECRET_KEY 在 production 下拒绝启动
ENVIRONMENT=production .venv/bin/python -c "from app.core.config import Settings; Settings(ENVIRONMENT='production').validate_runtime()"
```

- [ ] 计算器安全求值：`9**9**9` 被拒（AST 白名单禁幂运算），普通表达式正常
- [ ] 天气工具走**校验证书**的 HTTPS（无 `_create_unverified_context`）
- [ ] 高危工具默认不裸放：`ALLOW_DANGEROUS_TOOLS=false` 且 `HITL_ENABLED=false` 时不加载
- [ ] 生产 + 默认 `SECRET_KEY` → `validate_runtime` 抛 RuntimeError（上面命令）

---

## 17. 内容安全（M14，PII/敏感词）⚠️

```bash
# 敏感词拦截（不进 LLM）
TID=$(curl -s -X POST http://localhost:8000/api/v1/chat/tasks -H "Content-Type: application/json" -d '{"message":"这里有 banned_demo 请回答","stream":true}' | python3 -c "import sys,json;print(json.load(sys.stdin)['task_id'])")
curl -s -N "http://localhost:8000/api/v1/chat/tasks/$TID/stream" | grep -o '不被允许\|"type": "error"'
```

- [ ] ⚠️ 含敏感词 `banned_demo` 的输入被拦截，返回 error，不调用 LLM
- [ ] 手机号/身份证/银行卡/邮箱在送 LLM 前被脱敏（`pytest tests/test_content_safety.py` 覆盖）
- [ ] 落库的用户消息也是脱敏后的文本
- [ ] `CONTENT_SAFETY_ENABLED=false` 时原样放行

---

## 18. HITL 人审闭环（M14）⚠️🌐

```bash
# 触发审批（需模型调用 transfer_money）
TID=$(curl -s -X POST http://localhost:8000/api/v1/chat/tasks -H "Content-Type: application/json" -d '{"message":"请用 transfer_money 工具给账户A转账100元","stream":true}' | python3 -c "import sys,json;print(json.load(sys.stdin)['task_id'])")
curl -s -N --max-time 15 "http://localhost:8000/api/v1/chat/tasks/$TID/stream" | grep -o '"type": "approval_required"\|"tool": "[a-z_]*"'
# 批准后重连看恢复执行
curl -s -X POST "http://localhost:8000/api/v1/chat/tasks/$TID/approve" -H "Content-Type: application/json" -d '{"approved":true}'
curl -s -N --max-time 10 "http://localhost:8000/api/v1/chat/tasks/$TID/stream?after_id=0" | grep -o '"type": "[a-z_]*"'
```

- [ ] ⚠️ 调用高危工具前暂停并发 `approval_required`（不直接执行）
- [ ] ⚠️ 批准（`/approve {approved:true}`）后 resume → `tool_result` 执行 → 最终回答
- [ ] 拒绝（`{approved:false}`）后工具不执行、图继续（`pytest tests/test_hitl.py` 覆盖）
- [ ] 超时不永久卡死（`HITL_APPROVAL_TIMEOUT`）
- [ ] 🌐 UI 出现审批卡片，点"批准/拒绝"生效

---

## 19. 数据库与迁移（M13.5）

```bash
# Alembic 在全新 SQLite 建表
rm -f /tmp/mig.db; DATABASE_URL="sqlite+aiosqlite:////tmp/mig.db" .venv/bin/alembic upgrade head; rm -f /tmp/mig.db
# Postgres 离线 DDL（无需真库）
DATABASE_URL="postgresql+asyncpg://u:p@localhost/db" .venv/bin/alembic upgrade head --sql | head -20
```

- [ ] `alembic upgrade head` 在全新 SQLite 建出 6 张表 + `alembic_version`
- [ ] Postgres 离线 DDL 渲染合法（VARCHAR/JSON/BOOLEAN/CREATE INDEX）
- [ ] 🧩 真实 Postgres：设 `DATABASE_URL`、`pip install "psycopg[binary]" langgraph-checkpoint-postgres`、`alembic upgrade head` 后端到端可用（见 `docs/DATABASE.md`）

---

## 20. 部署与文档站

```bash
docker compose up --build    # 🧩 Docker 一键部署
npm run diagrams             # 架构图查看器 → http://localhost:9000/docs/diagrams.html
```

- [ ] 🧩 `docker compose up` 后 `http://localhost:8000/ui` 可用
- [ ] 🌐 `docs/index.html` 门户、`docs/interview/`（面试题站）、`docs/learn-game/`（闯关）可打开
- [ ] `docs/` 下 ARCHITECTURE / DATABASE / AI-TESTING / ACCEPTANCE-M12 / GAP-ANALYSIS 等文档齐全

---

## 一键快速回归（最小命令集）

```bash
cd apps/api && .venv/bin/python -m pytest tests/ -q     # 101 passed
cd ../web && npm run build                              # 前端构建通过
# 起服务后：
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/health   # 200
```

> 说明：标 ⚠️ 的项依赖真实 LLM，本清单里的自动化测试（第 1 节）已对绝大多数逻辑做了**离线覆盖**；
> ⚠️/🌐/🧩 项用于对"真实模型行为 / 界面观感 / 外部服务"的补充人工确认。
