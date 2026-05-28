"""
MCP Servers 包

每个 MCP Server 是一个独立可执行的 Python 模块。
设计目标：
1. 可独立运行（python -m app.mcp_servers.weather_server）
2. 可被 Claude Desktop / Cursor 等任意 MCP Host 复用（不绑定本项目）
3. 工具增减不需要重启主 API 进程（只需重启对应 server）
"""
