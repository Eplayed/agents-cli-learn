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
    - 自动 round-robin 调度
    - get_tools() 是无状态的：每次调用工具时新建 ClientSession（默认行为）
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
    # get_tools() 会：
    # 1. 启动每个 server（stdio 进程或连接 http endpoint）
    # 2. 调 list_tools() 拿 schema
    # 3. 把每个 MCP tool 包装成 LangChain BaseTool
    _TOOLS_CACHE = await _CLIENT.get_tools()
    return _TOOLS_CACHE


async def reload_mcp_tools() -> List[BaseTool]:
    """强制重载（开发时改了 server 工具后用）"""
    global _TOOLS_CACHE, _CLIENT
    _TOOLS_CACHE = None
    _CLIENT = None
    return await get_mcp_tools()
