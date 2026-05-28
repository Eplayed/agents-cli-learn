"""
Utils MCP Server (stdio transport)

把"通用工具"（计算器、占位搜索）打包成一个 MCP Server。
这样可以演示"一个 Agent 同时连多个 MCP Server"的模式。

如何独立运行：
    python -m app.mcp_servers.utils_server
"""
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Utils")


@mcp.tool()
def calculator(expr: str) -> str:
    """执行简单数学表达式计算。
    
    Args:
        expr: 数学表达式字符串。仅允许数字与 +-*/.() 空格。
    
    Returns:
        计算结果字符串；如果表达式非法则返回错误信息。
    """
    # 安全：白名单字符 + eval（仅允许纯数学）
    # 警告：生产环境不要用 eval，应该用 ast.literal_eval 或专用解析器
    try:
        allowed = set("0123456789+-*/.() ")
        if set(expr) - allowed:
            return "Error: invalid chars (only digits and +-*/.() allowed)"
        return str(eval(expr))
    except Exception as e:
        return f"Error: {e}"


@mcp.tool()
def search_web(query: str) -> str:
    """联网搜索（占位实现）。
    
    Args:
        query: 搜索关键词
    
    Returns:
        搜索结果摘要。当前是占位符，需要配置 BRAVE_API_KEY 才能真实搜索。
    """
    # TODO：M4 之后接入真实搜索
    # 推荐：Brave Search API / Tavily / SerpAPI
    return f"Search results for: {query} (Configure BRAVE_API_KEY for real search)"


if __name__ == "__main__":
    mcp.run(transport="stdio")
