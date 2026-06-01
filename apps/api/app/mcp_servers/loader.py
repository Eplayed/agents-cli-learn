"""
MCP Tools Loader

职责：从 config.json 读配置 → 启动 MCP Servers → 拿到 LangChain Tool 列表 → 给 Agent 用。

为什么单独抽一个 loader？
1. 配置在一处：增加 server 只改 config.json
2. 启动时机可控：app 启动时一次性加载，避免每次请求都连 server
3. 可测试：测试时换一份 mock config 即可
"""
import json
from pathlib import Path
from typing import List

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient


# 全局缓存：避免每次请求都重新连接所有 MCP Server
_TOOLS_CACHE: List[BaseTool] | None = None
_CLIENT: MultiServerMCPClient | None = None


def _load_config() -> dict:
    """读 mcp_servers/config.json 并去掉以 _ 开头的注释字段"""
    cfg_path = Path(__file__).resolve().parent / "config.json"
    raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    servers = raw.get("mcpServers", {})

    # 把 _description / _comment 这类注释字段过滤掉
    # MultiServerMCPClient 只认识规范字段（command/args/transport/url 等）
    clean = {}
    for name, spec in servers.items():
        clean[name] = {k: v for k, v in spec.items() if not k.startswith("_")}
    return clean


async def get_mcp_tools() -> List[BaseTool]:
    """获取所有 MCP Server 暴露的工具，转成 LangChain Tool。

    使用 MultiServerMCPClient 的好处：
    - 一次配置多个 server（stdio + http 混用都行）
    - 自动处理 transport（stdio 子进程 / http 长连接）

    ⚠️ 关于"缓存"的边界（容易误解的点）：
    - 我们这里缓存的是【LangChain Tool 包装对象列表】，不是 stdio 子进程
    - MultiServerMCPClient 默认是【无状态模式】：每次调用工具会新建一个
      ClientSession，spawn 新的 stdio 子进程跑一次工具就退出
    - 这意味着：单次工具调用结束后，进程是被回收的；不存在"永久复用"
    - 如果工具需要长连接/共享上下文（比如长事务、流式工具），需要显式
      使用 client.session(name) 上下文管理器来管理持久化 Session：
        async with client.session("weather") as session:
            tools = await load_mcp_tools(session)
            # 在这个 with 块内，session 是同一个，子进程也是同一个
    - 对当前项目的简单天气/计算工具来说，无状态模式已经够用，性能也可接受
    - 后续 M5/M6 改造时，会把 client 移到 lifespan 里全局共享，避免重复
      建立连接的开销

    参考：https://docs.langchain.com/oss/python/langchain/mcp
    """
    global _TOOLS_CACHE, _CLIENT

    if _TOOLS_CACHE is not None:
        return _TOOLS_CACHE

    config = _load_config()
    if not config:
        # 没配置任何 server 的话，agent 就只是个纯聊天机器人
        _TOOLS_CACHE = []
        return _TOOLS_CACHE

    _CLIENT = MultiServerMCPClient(config)
    # get_tools() 在【无状态模式】下：
    # 1. 短暂启动每个 server（stdio 子进程或连接 http endpoint）
    # 2. 调 list_tools() 拿到 schema
    # 3. 把每个 MCP tool 包装成 LangChain BaseTool 后返回
    # 4. 这次拿 schema 用的连接随之关闭
    # 实际工具执行时，每次调用会重新建立一次 ClientSession
    _TOOLS_CACHE = await _CLIENT.get_tools()
    return _TOOLS_CACHE


async def reload_mcp_tools() -> List[BaseTool]:
    """强制重载（开发时改了 server 工具后用）"""
    global _TOOLS_CACHE, _CLIENT
    _TOOLS_CACHE = None
    _CLIENT = None
    return await get_mcp_tools()
