# 本地运行指南

> ⚠️ **重要：项目已切换为 Python Web-only**
>
> 旧的 `npm start` / TS CLI 已经归档到 `archive/cli/`，**不再使用**。
> 现在的入口是 Python FastAPI（`apps/api/`）。

---

## 1. 准备环境（一次性）

### 1.1 检查 Python 版本

```bash
python3 --version   # 需要 3.10+
```

如果版本太低，用 [uv](https://docs.astral.sh/uv/getting-started/installation/) 或 pyenv 装新版。

### 1.2 创建 venv 并装依赖

```bash
cd /Users/noahadmin/noah/agents-cli-learn/apps/api

# 创建 venv（项目本地，不污染全局）
python3 -m venv .venv
source .venv/bin/activate

# 装依赖
pip install -r requirements.txt
```

装完看到类似：
```
Successfully installed fastapi-0.109.0 langgraph-... langchain-mcp-adapters-... mcp-... ...
```

### 1.3 配置 OpenAI API Key

项目根目录有 `.env.example`，复制成 `.env.dev`：

```bash
# 在项目根目录（不是 apps/api/）
cd /Users/noahadmin/noah/agents-cli-learn
cp .env.example .env.dev

# 编辑 .env.dev，填入真实 key
# OPENAI_API_KEY=sk-xxxxxxxxxxxxx
# OPENAI_BASE_URL=https://api.openai.com/v1   # 默认即可
# OPENAI_MODEL=gpt-4o-mini                    # 推荐这个，便宜
```

> **配置加载顺序**：`apps/api/app/core/config.py` 会按以下优先级读：
> 1. `apps/api/.env`
> 2. 项目根 `.env`
> 3. 项目根 `.env.dev`（推荐用这个，前后端共用一份）

---

## 2. 启动服务

### 2.1 验证 MCP Server 能单跑（推荐先做一遍）

```bash
cd apps/api
source .venv/bin/activate

# 单独启动 weather MCP server（验证它没坏）
python -m app.mcp_servers.weather_server
# 没报错就 OK，按 Ctrl+C 退出
```

如果这步报错，后面 API 启动也会失败。常见错误：
- `ModuleNotFoundError: mcp` → `pip install -r requirements.txt` 没装上
- `ModuleNotFoundError: app.mcp_servers` → 不是在 `apps/api/` 目录下跑

### 2.2 启动 FastAPI

```bash
cd apps/api
source .venv/bin/activate

uvicorn app.main:app --reload --port 8000
```

成功启动会看到：
```
INFO:     Uvicorn running on http://127.0.0.1:8000
Starting Noah Agent Platform...
Database initialized
INFO:     Application startup complete.
```

### 2.3 打开 Web UI

浏览器访问：

| 地址 | 用途 |
|---|---|
| http://localhost:8000/ui | Web 对话界面 |
| http://localhost:8000/docs | FastAPI 自动生成的 API 文档（Swagger） |
| http://localhost:8000/health | 健康检查 |

---

## 3. 命令行测试（不开 UI）

```bash
# 创建一个会话
curl -X POST http://localhost:8000/api/v1/session/ \
  -H "Content-Type: application/json" \
  -d '{}'

# 流式对话
curl -X POST http://localhost:8000/api/v1/chat/stream_ndjson \
  -H "Content-Type: application/json" \
  -d '{"message": "上海今天天气怎么样，适合洗车吗"}'
```

NDJSON 流式响应每行一个 JSON：
```json
{"type": "tool_calls", "data": {"name": "get_weather", "input": {"city": "上海"}}}
{"type": "tool_result", "data": {"name": "get_weather", "output": "Shanghai 今日天气..."}}
{"type": "text", "content": "根据天气数据..."}
{"type": "done", "content": ""}
```

注意 `tool_calls.name`：
- `get_weather` → MCP 加载成功 ✅
- `_get_weather_fallback` → 回退到内嵌工具，去看终端日志找原因

---

## 4. 看架构图

```bash
# 在项目根目录
cd /Users/noahadmin/noah/agents-cli-learn

# 用 npm 脚本（本质是 python3 -m http.server）
npm run diagrams
# 或直接：python3 -m http.server 9000

# 浏览器打开
open http://localhost:9000/docs/diagrams.html
```

---

## 5. 常见问题

### Q: `npm start` 报错 `Cannot find module './cli.ts'`
**原因**：旧 CLI 已归档到 `archive/cli/`，`npm start` 不再是入口。  
**解决**：忽略 npm，按上面 §2 用 uvicorn 启动。

### Q: 启动后访问 `/api/v1/chat/stream_ndjson` 返回 `OPENAI_API_KEY 未配置`
**解决**：检查 `.env.dev` 在项目**根目录**且填了真实 key（不是占位符）。

### Q: MCP 工具调用失败，回退到 `_get_weather_fallback`
**排查步骤**：
1. 重新装依赖：`pip install -r requirements.txt`
2. 单独跑 server：`python -m app.mcp_servers.weather_server` 看是否报错
3. 看 uvicorn 终端日志，会有 `[SingleAgent] MCP 工具加载失败:` 提示

### Q: `OPENAI_API_KEY` 用国内代理（如 SiliconFlow）
编辑 `.env.dev`：
```
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=Qwen/Qwen2.5-7B-Instruct
```

### Q: 改了代码不生效
- Python：`uvicorn ... --reload` 已开启自动重载，存盘即生效
- MCP Server 改了：需要**重启** uvicorn（缓存了 server 子进程）

---

## 6. 推荐的开发布局

打开两个终端，效率最高：

**终端 1：API 服务**
```bash
cd apps/api && source .venv/bin/activate
uvicorn app.main:app --reload
```

**终端 2：架构图查看器**
```bash
npm run diagrams
# 浏览器打开 http://localhost:9000/docs/diagrams.html
```

浏览器开两个标签：
- http://localhost:8000/ui （对话）
- http://localhost:8000/docs （API 调试）

---

## 7. 下次启动只要做什么

```bash
# 终端 1：起 API
cd apps/api && source .venv/bin/activate && uvicorn app.main:app --reload

# 终端 2（可选）：起图查看器
cd /Users/noahadmin/noah/agents-cli-learn && npm run diagrams
```

不需要重新装依赖，不需要重新填 .env。
