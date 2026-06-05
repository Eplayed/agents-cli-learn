"""
Time MCP Server (HTTP transport)

演示用 HTTP 模式运行 MCP Server（区别于 weather/utils 的 stdio）。

HTTP 模式适合：
- 远程部署（Server 在另一台机器）
- 多个 Agent 共享同一个 Server 实例
- 需要自己加鉴权/限流的场景

如何独立运行（在 8001 端口启动 HTTP MCP Server）：
    python -m app.mcp_servers.time_server

如何验证：
    curl http://localhost:8001/mcp -X POST -H "Content-Type: application/json" \\
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
"""
from datetime import datetime, timezone, timedelta

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Time")


@mcp.tool(
    annotations={
        "readOnlyHint": True,      # 只读：获取时间不修改状态
        "openWorldHint": False,    # 无外部调用：系统本地时间
    },
)
def get_current_time(timezone_offset: int = 8) -> str:
    """获取指定时区的当前时间。

    适用于需要知道当前日期和时间的场景（如判断工作日、计算时差）。
    返回格式化的日期时间字符串，包含年月日时分秒和星期。

    Args:
        timezone_offset: UTC 时区偏移（小时），默认 8 表示北京时间（UTC+8）。
                        例如：0=UTC, 8=北京, 9=东京, -5=纽约
    """
    tz = timezone(timedelta(hours=timezone_offset))
    now = datetime.now(tz)
    weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    weekday = weekdays[now.weekday()]
    tz_name = f"UTC{'+' if timezone_offset >= 0 else ''}{timezone_offset}"
    return (
        f"{now.strftime('%Y-%m-%d %H:%M:%S')} {weekday} ({tz_name})"
    )


@mcp.tool(
    annotations={
        "readOnlyHint": True,
        "openWorldHint": False,
    },
)
def calculate_date_diff(date1: str, date2: str) -> str:
    """计算两个日期之间相差多少天。

    适用于需要计算时间间隔的场景（如项目截止倒计时、年龄计算）。
    返回两个日期之间的天数差值。

    Args:
        date1: 第一个日期，格式 YYYY-MM-DD（如 "2026-01-01"）
        date2: 第二个日期，格式 YYYY-MM-DD（如 "2026-12-31"）
    """
    try:
        d1 = datetime.strptime(date1.strip(), "%Y-%m-%d")
        d2 = datetime.strptime(date2.strip(), "%Y-%m-%d")
        diff = abs((d2 - d1).days)
        return f"{date1} 到 {date2} 相差 {diff} 天"
    except ValueError as e:
        return f"日期格式错误：{e}（请使用 YYYY-MM-DD 格式）"


if __name__ == "__main__":
    # HTTP transport：在 8001 端口启动 HTTP MCP Server
    # 与 stdio 的区别：
    # - stdio：被主进程 spawn 为子进程，stdin/stdout 通信
    # - http：独立进程，监听端口，任何能发 HTTP 的客户端都能连
    mcp.run(transport="http", host="127.0.0.1", port=8001)
