"""
安全加固测试（M13.6）

- safe_eval_math：正确计算 / 拒绝幂运算(DoS)/ 拒绝变量·函数调用 / 除零
- secure_ssl_context：确实开启证书校验
- calculator 工具：非法字符拒绝、正常计算、eval 注入被挡
- validate_runtime：生产默认 SECRET_KEY 拒绝启动；开发环境不打扰
- 高危工具门禁：默认不加载 _dangerous server
"""
import ssl

import pytest


# ---------------- safe_eval_math ----------------

def test_safe_eval_basic():
    from app.core.safe_tools import safe_eval_math
    assert safe_eval_math("(3+5)*12") == 96
    assert safe_eval_math("10 / 4") == 2.5
    assert safe_eval_math("-2 + 3") == 1
    assert safe_eval_math("7 % 3") == 1


def test_safe_eval_rejects_power_dos():
    """** 幂运算被禁（9**9**9 可打满 CPU）"""
    from app.core.safe_tools import safe_eval_math
    with pytest.raises(ValueError):
        safe_eval_math("9**9**9")


def test_safe_eval_rejects_code_injection():
    from app.core.safe_tools import safe_eval_math
    for bad in ["__import__('os').system('ls')", "abs(-1)", "x + 1", "[1,2,3]"]:
        with pytest.raises((ValueError, SyntaxError)):
            safe_eval_math(bad)


def test_safe_eval_div_zero():
    from app.core.safe_tools import safe_eval_math
    with pytest.raises(ZeroDivisionError):
        safe_eval_math("1/0")


def test_secure_ssl_context_verifies():
    from app.core.safe_tools import secure_ssl_context
    ctx = secure_ssl_context()
    assert ctx.verify_mode == ssl.CERT_REQUIRED
    assert ctx.check_hostname is True


# ---------------- calculator 工具（内嵌 + MCP 同一逻辑） ----------------

def test_calculator_tool_normal_and_injection():
    from app.agents.single.agent import _calculator_fallback
    # LangChain @tool 包装后用 .invoke 调
    assert _calculator_fallback.invoke({"expr": "(3+5)*12"}) == "96"
    assert "invalid chars" in _calculator_fallback.invoke({"expr": "__import__('os')"}).lower()
    # 幂运算字符合法但被 AST 挡下 → Error
    assert _calculator_fallback.invoke({"expr": "9**9**9"}).startswith("Error")


# ---------------- 生产启动校验 ----------------

def test_validate_runtime_prod_rejects_default_secret():
    from app.core.config import Settings
    s = Settings(ENVIRONMENT="production", SECRET_KEY="dev-secret-key-change-in-production")
    with pytest.raises(RuntimeError):
        s.validate_runtime()


def test_validate_runtime_prod_ok_returns_warnings():
    from app.core.config import Settings
    s = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="a-strong-random-secret",
        DEBUG=True,  # 触发一条警告
    )
    warnings = s.validate_runtime()
    assert isinstance(warnings, list)
    assert any("DEBUG" in w for w in warnings)


def test_validate_runtime_dev_is_silent():
    from app.core.config import Settings
    s = Settings(ENVIRONMENT="development", SECRET_KEY="dev-secret-key-change-in-production")
    assert s.validate_runtime() == []


# ---------------- 高危工具门禁 ----------------

def test_dangerous_tools_disabled_by_default(monkeypatch):
    from app.core import config as config_module
    from app.mcp_servers import loader
    monkeypatch.setattr(config_module.settings, "ALLOW_DANGEROUS_TOOLS", False)
    monkeypatch.setattr(loader.settings, "ALLOW_DANGEROUS_TOOLS", False)
    cfg = loader._load_config()
    assert "dangerous" not in cfg, "默认应过滤掉高危工具集"


def test_dangerous_tools_enabled_when_flag_on(monkeypatch):
    from app.mcp_servers import loader
    monkeypatch.setattr(loader.settings, "ALLOW_DANGEROUS_TOOLS", True)
    cfg = loader._load_config()
    assert "dangerous" in cfg, "开启开关后应加载高危工具集"
