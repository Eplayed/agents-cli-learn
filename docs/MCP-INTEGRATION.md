# MCP 集成实施记录

> 本文档记录 M4 里程碑（MCP 工具协议）的具体实现，便于事后回顾每一步在做什么、为什么。

---

## 1. 这次改动做了什么？

**目标**：把"工具"从 `agent.py` 的硬编码里搬出来，变成独立的 MCP Server。

**改动文件清单：**
```
新增：
  apps/api/app/mcp_servers/__init__.py       MCP servers 包入口
  apps/api/app/mcp_servers/weather_server.py 天气 MCP Server（stdio）
  apps/api/app/mcp_servers/utils_server.py   通用工具 MCP Server（stdio）
  apps/api/app/mcp_servers/config.json       MCP servers 注册配置
  apps/api/app/mcp_servers/loader.py         配置加载 + 工具转换器
  docs/MCP-INTEGRATION.md                    （本文档）

修改：
  apps/api/requirements.txt                  +mcp +langchain-mcp-adapters
  apps/api/app/agents/single/agent.py        工具来源改为 MCP（带回退）
```

---

## 2. 关键概念速览（必须搞懂）

### 2.1 MCP 是什么？

**一句话**：MCP 是"AI 工具的 USB-C 接口"——让任何 LLM 客户端都能用任何 server 提供的工具。

**核心组成（你必须记住的 3 个原语）：**
| 原语 | 作用 | 我们项目用到了吗 |
|---|---|---|
| **Tools** | 可调用的函数（带 schema） | ✅ `get_weather` / `calculator` |
| **Resources** | 可读取的上下文（文件、DB 记录） | ❌ 暂未用 |
| **Prompts** | 可复用的提示词模板 | ❌ 暂未用 |

**Transport（传输层）：**
- `stdio`：本地子进程，stdin/stdout 通信。**最常见**，启动快
- `http` / `streamable_http`：远程部署用
- `sse`：旧规范，逐步淘汰

### 2.2 FastMCP 怎么写一个工具？

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MyServer")

@mcp.tool()  # ← 关键：装饰器把函数变成 MCP Tool
def my_tool(arg: str) -> str:
    """函数 docstring 会作为 tool 描述发给 LLM（写好它！）"""
    return "..."

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

**比 LangChain `@tool` 强在哪？**
- LangChain `@tool` 只能在自己的进程里用
- MCP `@mcp.tool()` 任何 MCP Host 都能用（Claude Desktop / Cursor / Codex / 你自己的 agent）

### 2.3 MultiServerMCPClient 怎么把工具喂给 LangGraph？

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({
    "weather": {
        "command": "python",
        "args": ["-m", "app.mcp_servers.weather_server"],
        "transport": "stdio",
    }
})
tools = await client.get_tools()  # → list[BaseTool]，可直接 bind_tools
```

**幕后发生了什么？**
1. 启动 server 子进程（每个 server 一个独立进程）
2. 调 server 的 `list_tools()` 拿到 schema
3. 把每个 MCP Tool 包装成 LangChain `BaseTool`
4. LangGraph 的 `ToolNode` 拿到这些 tool 后，行为和原来完全一样

---

## 3. 我们这次的设计决策

### 决策 1：为什么把 weather 和 utils 拆成两个 server？

**理由：**
- 演示"一个 agent 同时连多个 server"的能力（这是 MCP 的核心卖点）
- 真实场景中，工具按"领域"分组：weather 调外部 API、utils 是纯本地计算，混在一起耦合度高
- 独立部署更灵活：weather 出问题（如 Open-Meteo 挂了）不影响 calculator

### 决策 2：为什么用配置文件而不是代码注册？

**理由：**
- 配置和代码分离：增加 server 不需要 git push 代码
- 标准格式：`config.json` 的格式直接复制 Claude Desktop 的 `mcpServers` 配置
- 支持环境差异：本地用 stdio，生产可改成 http transport，配置一改就行

**配置示例：**
```json
{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["-m", "app.mcp_servers.weather_server"],
      "transport": "stdio"
    }
  }
}
```

### 决策 3：为什么保留内嵌工具作为回退？

**理由：**
- 教学：你可以对比"内嵌 @tool" 和 "MCP @mcp.tool()" 的代码差异
- 容错：MCP 配置错了，agent 仍能跑（避免开发者一开始就遇到大坑）
- 渐进迁移：将来如果某个工具暂时不想拆 server，依然能用

回退逻辑在 `_resolve_tools_sync()` 里：先 `get_mcp_tools()`，异常就 `_get_fallback_tools()`。

### 决策 4：为什么 loader 里用全局缓存？

**理由：**
- MCP server 启动有开销（fork 子进程 + 握手）
- 每个请求都重新连接 → 慢且浪费资源
- 缓存的代价：开发时改了 server 代码要重启 API（可接受）

---

## 4. 怎么验证它跑通了？

### 验证 1：MCP Server 能独立运行

```bash
cd apps/api
python -m app.mcp_servers.weather_server
```

不会有输出（stdio 在等输入），但**没报错**就说明 server OK。Ctrl+C 退出。

### 验证 2：用 Inspector 调试 server

```bash
# 装 mcp inspector（一次性）
npx @modelcontextprotocol/inspector python -m app.mcp_servers.weather_server
```

会弹出 Web 界面，可以手动调用工具看返回。**这是排查 MCP 问题最有用的工具**。

### 验证 3：API 启动后能用 MCP 工具

```bash
cd apps/api
pip install -r requirements.txt
uvicorn app.main:app --reload

# 另一个终端
curl -X POST http://localhost:8000/api/v1/chat/stream_ndjson \
  -H "Content-Type: application/json" \
  -d '{"message": "上海今天天气怎么样"}'
```

应该看到流式 NDJSON：
```
{"type": "tool_calls", "data": {"name": "get_weather", "input": {"city": "上海"}}}
{"type": "tool_result", "data": {"name": "get_weather", "output": "Shanghai 今日天气..."}}
{"type": "text", "content": "..."}
{"type": "done", "content": ""}
```

注意 tool 名是 `get_weather`（来自 MCP server 的函数名），如果回退到内嵌工具会是 `_get_weather_fallback`。

### 验证 4：把 server 注册到 Claude Desktop（可选，体验生态价值）

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：
```json
{
  "mcpServers": {
    "noah-weather": {
      "command": "/path/to/python",
      "args": ["-m", "app.mcp_servers.weather_server"],
      "cwd": "/Users/noahadmin/noah/agents-cli-learn/apps/api"
    }
  }
}
```

重启 Claude Desktop，对话框右下角会出现 🔌 图标，点开能看到 `get_weather` 工具——**这就是 MCP 生态的力量**：你写一次工具，Claude / Cursor / 任何 MCP Host 都能用。

---

## 5. 常见问题

### Q1: 为什么我跑起来 tool 名变成了 `_get_weather_fallback`？
说明 MCP 加载失败了。看终端日志会有 `[SingleAgent] MCP 工具加载失败，回退到内嵌工具:` 提示。常见原因：
1. `pip install` 没装上 `mcp` 和 `langchain-mcp-adapters`
2. `python -m app.mcp_servers.weather_server` 单跑也报错（先修这个）
3. cwd 不对，找不到 `app.mcp_servers` 模块（在 `apps/api/` 下跑）

### Q2: stdio 和 http 怎么选？
| 场景 | 用什么 |
|---|---|
| 本地开发 / 个人桌面 | stdio |
| 远程部署 / 多 agent 共享一个 server | http |
| 生产环境暴露给前端（罕见） | streamable_http + 鉴权 |

### Q3: 这次改动后 SingleAgent 的图结构变了吗？
**没变**。还是 `agent → tools → agent` 的循环，`tools_condition` 也没动。  
变的只是 `self.tools` 的来源——以前来自 `@tool` 装饰器，现在来自 MCP。

### Q4: 工具描述（docstring）写不好会怎样？
**LLM 可能不调用工具**，或者调用时参数错。  
MCP 把 docstring 作为 tool description 发给 LLM，写法直接影响调用准确率。  
建议：用 Args/Returns 标准格式，每个参数说清楚类型和取值范围。

---

## 6. 下一步（M4 → M5）

MCP 跑通后，你下一步该做的是：

1. **加更多 MCP server 体验生态**：
   - 装官方 [Filesystem MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)：让 agent 能读你电脑文件
   - 装 [GitHub MCP](https://github.com/github/github-mcp-server)：让 agent 能查 PR / issue

2. **进入 M5（Checkpoint 持久化 + 预算控制）**：
   - 把 `MemorySaver` 换成 `AsyncSqliteSaver`
   - 加 `recursion_limit` / `max_tokens` / `timeout`

3. **顺手把 MCP 加载移到 lifespan（性能优化）**：
   - 当前 `_resolve_tools_sync` 用了 ThreadPoolExecutor 适配同步入口，这是临时方案
   - M5 可以改成 lifespan 里 await 一次，存进 `app.state.mcp_tools`，每次请求复用

---

> 内容根据公开搜索结果做了改写以符合引用规范
