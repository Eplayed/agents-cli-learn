"""
MCP Tools Loader

职责：从 config.json 读配置 → 启动 MCP Servers → 拿到 LangChain Tool 列表 → 给 Agent 用。

为什么单独抽一个 loader？
1. 配置在一处：增加 server 只改 config.json
2. 启动时机可控：app 启动时一次性加载，避免每次请求都连 server
3. 可测试：测试时换一份 mock config 即可
"""
import json
import sys
from pathlib import Path
from typing import List

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

from app.core.config import settings


# 全局缓存：避免每次请求都重新连接所有 MCP Server
_TOOLS_CACHE: List[BaseTool] | None = None
_CLIENT: MultiServerMCPClient | None = None


def _resolve_venv_python() -> str:
    """动态解析 venv 的 Python 路径。

    策略：
    1. 优先用当前运行的 Python 解释器（sys.executable）
       — 如果是通过 .venv/bin/python 启动的，这就是正确路径
    2. 回退：从 loader.py 的位置反推 apps/api/.venv/bin/python
    3. 最终回退：裸 "python"（系统默认）

    为什么这样设计？
    - `npm run dev` 从项目根启动时 cwd 是根目录，但 sys.executable 指向 venv
    - `cd apps/api && .venv/bin/uvicorn` 时 sys.executable 同样指向 venv
    - Docker 容器内没有 venv，sys.executable 就是系统 python，也能工作
    """
    # 方式 1：当前解释器（最可靠 — 如果项目是通过 venv 启动的）
    current_python = sys.executable
    if current_python and Path(current_python).exists():
        return current_python

    # 方式 2：从本文件位置反推 venv 路径
    # loader.py 位于 apps/api/app/mcp_servers/loader.py
    # venv 位于 apps/api/.venv/bin/python
    api_root = Path(__file__).resolve().parent.parent.parent  # apps/api/
    venv_python = api_root / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)

    # 方式 3：回退到系统 python
    print("[MCP Loader] ⚠️ 未找到 venv Python，使用系统 'python'。建议先运行 ./setup.sh 创建虚拟环境。")
    return "python"


def _load_config() -> dict:
    """读 mcp_servers/config.json 并去掉以 _ 开头的注释字段，同时修正 python 路径"""
    cfg_path = Path(__file__).resolve().parent / "config.json"
    raw = json.loads(cfg_path.read_text(encoding="utf-8"))
    servers = raw.get("mcpServers", {})

    # 解析 venv python 路径（一次性，所有 server 共用）
    venv_python = _resolve_venv_python()

    # 把 _description / _comment 这类注释字段过滤掉
    # 同时将 command 为 "python" 的替换为 venv python 路径
    clean = {}
    for name, spec in servers.items():
        # 安全门禁（M13.6）：标了 _dangerous 的 server 默认不加载，
        # 除非 ALLOW_DANGEROUS_TOOLS=true。防止 Agent 自主调用删除/转账等高危工具。
        if spec.get("_dangerous") and not settings.ALLOW_DANGEROUS_TOOLS:
            print(f"[MCP Loader] 跳过高危工具集 '{name}'（ALLOW_DANGEROUS_TOOLS=false）")
            continue

        server_conf = {k: v for k, v in spec.items() if not k.startswith("_")}

        # 动态替换 python 命令为 venv 路径
        if server_conf.get("command") == "python":
            server_conf["command"] = venv_python

        clean[name] = server_conf

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
