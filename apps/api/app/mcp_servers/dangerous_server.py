"""
Dangerous Tools MCP Server (stdio transport)

演示"危险工具"——在 Agent 里需要 HITL（人工确认）才能执行的工具。
用于 M5 的 interrupt() 机制学习。

这些工具本身是模拟的（不会真删数据），但在 Agent 注册中心里
被标记为"需要确认"，触发 LangGraph 的 interrupt 暂停机制。

如何独立运行：
    python -m app.mcp_servers.dangerous_server
"""
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("DangerousOps")


@mcp.tool(
    annotations={
        "readOnlyHint": False,
        "destructiveHint": True,    # 不可逆操作
        "idempotentHint": True,     # 删已删的不报错
        "openWorldHint": False,
    },
)
def delete_all_data(confirm_text: str) -> str:
    """永久删除所有用户数据（不可逆操作，仅用于演示 HITL 机制）。

    适用于需要清空所有数据的极端场景。此操作不可恢复。
    调用前 Agent 应该通过 interrupt 机制请求用户确认。

    Args:
        confirm_text: 必须输入 "DELETE ALL" 才会执行（二次确认）
    """
    if confirm_text != "DELETE ALL":
        return "操作已取消：确认文本不匹配。需要输入 'DELETE ALL' 才能执行。"
    # 模拟操作（学习项目不会真删）
    return "⚠️ [模拟] 所有数据已删除。（这是演示，实际未执行任何删除）"


@mcp.tool(
    annotations={
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,    # 每次调用产生新记录
        "openWorldHint": True,      # 调用外部支付系统
    },
)
def transfer_money(to_account: str, amount: float, currency: str = "CNY") -> str:
    """向指定账户转账（模拟操作，演示 HITL 中的高敏感操作确认）。

    适用于需要资金转移的场景。此操作涉及资金安全，Agent 应该
    通过 interrupt 机制请求用户确认金额和收款方。

    Args:
        to_account: 收款账户标识（如 "user_001"）
        amount: 转账金额（正数）
        currency: 货币类型，默认 CNY
    """
    if amount <= 0:
        return "错误：金额必须大于 0"
    if amount > 10000:
        return f"⚠️ [模拟] 大额转账 {currency} {amount} → {to_account}（需要额外审批，这是演示）"
    return f"✅ [模拟] 已转账 {currency} {amount} → {to_account}（这是演示，未实际转账）"


if __name__ == "__main__":
    mcp.run(transport="stdio")
