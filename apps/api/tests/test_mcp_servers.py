"""
场景测试 5：MCP Server 工具可独立执行

直接导入 MCP Server 里的工具函数做单元测试（不需要启动 server 进程）。
"""
import pytest


def test_weather_tool_valid_city():
    """天气工具：正常城市能返回数据"""
    from app.mcp_servers.weather_server import get_weather
    result = get_weather("北京")
    # 可能返回真实数据或离线数据，但不应该报错
    assert isinstance(result, str)
    assert len(result) > 10
    assert "北京" in result or "Beijing" in result


def test_weather_tool_invalid_city():
    """天气工具：无效城市返回提示"""
    from app.mcp_servers.weather_server import get_weather
    result = get_weather("xyznotacity123")
    assert "未找到" in result or "失败" in result


def test_calculator_valid():
    """计算器：正常计算"""
    from app.mcp_servers.utils_server import calculator
    assert calculator("(3+5)*2") == "16"
    assert calculator("100/4") == "25.0"


def test_calculator_invalid_chars():
    """计算器：非法字符被拦截"""
    from app.mcp_servers.utils_server import calculator
    result = calculator("import os")
    assert "Error" in result or "invalid" in result


def test_calculator_division_by_zero():
    """计算器：除零错误"""
    from app.mcp_servers.utils_server import calculator
    result = calculator("1/0")
    assert "Error" in result


def test_search_web_placeholder():
    """搜索：占位实现返回提示"""
    from app.mcp_servers.utils_server import search_web
    result = search_web("test query")
    assert "test query" in result
    assert "BRAVE_API_KEY" in result


def test_dangerous_delete_wrong_confirm():
    """危险工具：确认文本不对时拒绝"""
    from app.mcp_servers.dangerous_server import delete_all_data
    result = delete_all_data("yes please")
    assert "取消" in result


def test_dangerous_delete_correct_confirm():
    """危险工具：确认文本正确时执行（模拟）"""
    from app.mcp_servers.dangerous_server import delete_all_data
    result = delete_all_data("DELETE ALL")
    assert "模拟" in result


def test_dangerous_transfer_valid():
    """转账工具：正常转账（模拟）"""
    from app.mcp_servers.dangerous_server import transfer_money
    result = transfer_money("user_001", 100.0)
    assert "模拟" in result
    assert "100" in result


def test_dangerous_transfer_negative():
    """转账工具：负金额被拒绝"""
    from app.mcp_servers.dangerous_server import transfer_money
    result = transfer_money("user_001", -50)
    assert "错误" in result or "大于 0" in result


def test_dangerous_transfer_large_amount():
    """转账工具：大额触发额外提示"""
    from app.mcp_servers.dangerous_server import transfer_money
    result = transfer_money("user_001", 50000)
    assert "大额" in result or "审批" in result
