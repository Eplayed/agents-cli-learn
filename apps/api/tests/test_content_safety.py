"""
内容安全测试（M14 子目标 B）
"""
import pytest


def test_mask_phone():
    from app.core.content_safety import mask_pii
    out, changed = mask_pii("我的手机号是 13812345678，请记一下")
    assert changed
    assert "13812345678" not in out
    assert "138****5678" in out


def test_mask_id_card():
    from app.core.content_safety import mask_pii
    out, changed = mask_pii("身份证 110101199001011234 谢谢")
    assert changed
    assert "110101199001011234" not in out
    assert "110101********1234" in out


def test_mask_bank_card():
    from app.core.content_safety import mask_pii
    out, changed = mask_pii("卡号 6222021234567890123")  # 19 位
    assert changed
    assert "6222021234567890123" not in out
    assert out.startswith("卡号 6222") and out.endswith("0123")
    assert "*" in out


def test_mask_email():
    from app.core.content_safety import mask_pii
    out, changed = mask_pii("邮箱 alice@example.com")
    assert changed
    assert "alice@example.com" not in out
    assert "a***@example.com" in out


def test_no_pii_unchanged():
    from app.core.content_safety import mask_pii
    out, changed = mask_pii("今天天气怎么样")
    assert not changed
    assert out == "今天天气怎么样"


def test_normal_number_not_masked():
    """普通数字（如金额、年份）不应被误当成卡号/手机号脱敏"""
    from app.core.content_safety import mask_pii
    out, changed = mask_pii("订单金额 12345 元，2026 年")
    assert not changed


def test_scan_sensitive_hit():
    from app.core.content_safety import scan_sensitive
    assert scan_sensitive("这里有测试违禁词出现") == ["测试违禁词"]
    assert scan_sensitive("正常内容") == []


def test_check_input_blocks_sensitive():
    from app.core.content_safety import check_input
    r = check_input("包含 banned_demo 的内容")
    assert r.allowed is False
    assert r.sensitive_hits
    assert r.reason


def test_check_input_allows_and_masks():
    from app.core.content_safety import check_input
    r = check_input("联系我 13812345678")
    assert r.allowed is True
    assert r.pii_masked is True
    assert "13812345678" not in r.text


def test_check_input_disabled_passthrough(monkeypatch):
    from app.core import content_safety
    from app.core.config import settings
    monkeypatch.setattr(settings, "CONTENT_SAFETY_ENABLED", False)
    r = content_safety.check_input("13812345678 banned_demo")
    assert r.allowed is True
    assert r.text == "13812345678 banned_demo"  # 关闭时原样放行
