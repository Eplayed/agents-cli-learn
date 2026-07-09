# DeerFlow 对照学习笔记（M12）

> 对应学习里程碑：[LEARNING-PLAN.md](../LEARNING-PLAN.md) 的 M12
> 参考仓库：[bytedance/deer-flow](https://github.com/bytedance/deer-flow)（MIT，独立 clone 在 `deer-flow-lab/`，与本项目零代码耦合，不提交进 git）
>
> 用途：把 DeerFlow 当一个可以本地跑起来的"生产级 harness"参考实现，边用边学它验证过的几个设计，再回过头改进 `agents-cli-learn` 自己的代码。这份笔记只记录**观察和结论**，不建议把 DeerFlow 的代码复制粘贴进本项目——目的是学思想，不是拼装。

---

## 1. 怎么把 DeerFlow 跑起来（独立环境，不影响本项目）

```bash
# 建议 clone 到本项目目录下的 deer-flow-lab/（已加入 .gitignore，不会被提交）
git clone https://github.com/bytedance/deer-flow.git deer-flow-lab
cd deer-flow-lab

# 环境要求（跑之前检查一遍）：
#   - Python >= 3.12（本项目用 3.13，兼容）
#   - Node.js >= 22（本项目开发机若是 v20，需要先切换：nvm use 22 或 nvm install 22）
#   - uv（Python 包管理器）
#   - pnpm（前端包管理器）
#   - Docker（推荐路径；本地裸机模式还需要 nginx）

make setup     # 交互式向导：选 LLM Provider、可选 Web 搜索、沙箱模式
make dev       # 本地开发模式启动（Gateway :8001 + 前端 :3000 + Nginx :2026）
# 或者 Docker 模式：
make docker-init && make docker-start

# 访问：http://localhost:2026
```

**端口占用提醒**：DeerFlow 默认用 `2026`/`8001`/`3000`。本项目的 Vue dev server 也用 `3000`（见 `apps/web/vite.config.ts`），FastAPI 用 `8000`。两个项目不要同时跑 `npm run dev`（本项目）和 `pnpm dev`（DeerFlow），否则 3000 端口冲突——分时段跑，或者改 DeerFlow 的 `frontend` 端口配置。

---

## 2. M12 三个借鉴点的验证记录

> 跑起来 DeerFlow、读完对应源码之后，在这里补充实际验证结果。以下是待填的框架。

### 2.1 Harness / App 边界检查

- **看的文件**：`deer-flow-lab/backend/tests/test_harness_boundary.py`、`backend/AGENTS.md` 的 "Harness / App Split" 章节
- **验证方式**：（待补充——比如：读一下这个测试具体怎么用 AST 检查 import）
- **对本项目的改动计划**：给 `apps/api/app/agents/*.py` + `apps/api/app/core/*.py` 写一个静态检查测试，断言它们不 import `app.api.*`
- **结论**：（待补充）

### 2.2 全链路 Trace-ID 关联

- **看的文件**：DeerFlow README 的 "Request Trace Correlation" 和 "Langfuse Tracing" 章节，`packages/harness/deerflow/trace_context.py`
- **验证方式**：（待补充——比如：在 DeerFlow 里发一个请求，看响应头 `X-Trace-Id`，再去 Langfuse 控制台核对 `metadata.deerflow_trace_id` 是否一致）
- **对本项目的改动计划**：加一个中间件，生成/复用 `X-Trace-Id`，塞进 `tracing.py` 的 Langfuse callback metadata，响应头回传
- **结论**：（待补充）

### 2.3 Goal 自动续跑护栏（可选）

- **看的文件**：DeerFlow README 的 "Session Goals" 章节
- **验证方式**：（待补充——比如：`/goal` 设置一个任务，观察它自动续跑几次、什么条件下停止）
- **对本项目的改动计划**：（可选，评估工作量后再决定是否做）
- **结论**：（待补充）

---

## 3. 其他观察（非 M12 范围，随手记）

（跑的过程中如果发现别的有意思的设计，记在这里，不必现在就规划成里程碑）
