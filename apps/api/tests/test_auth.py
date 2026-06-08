"""
场景测试 6：鉴权中间件

注意：这些测试在 AUTH_SECRET 未设置时（默认）会全放行。
要测 401 场景需要设置环境变量 AUTH_SECRET。
"""
import pytest
from unittest.mock import patch
from app.core.auth import get_current_user, get_current_user_optional, UserContext, _current_user


def test_get_current_user_no_context():
    """未认证时 get_current_user 抛 401"""
    from fastapi import HTTPException
    # 确保 context 为空
    token = _current_user.set(None)
    try:
        with pytest.raises(HTTPException) as exc_info:
            get_current_user()
        assert exc_info.value.status_code == 401
    finally:
        _current_user.reset(token)


def test_get_current_user_with_context():
    """有认证上下文时正常返回"""
    user = UserContext(user_id="test123", authenticated=True)
    token = _current_user.set(user)
    try:
        result = get_current_user()
        assert result.user_id == "test123"
        assert result.authenticated is True
    finally:
        _current_user.reset(token)


def test_get_current_user_optional_no_context():
    """未认证时 optional 版本返回 None 不抛异常"""
    token = _current_user.set(None)
    try:
        result = get_current_user_optional()
        assert result is None
    finally:
        _current_user.reset(token)


def test_get_current_user_optional_with_context():
    """有认证时 optional 版本正常返回"""
    user = UserContext(user_id="abc", authenticated=True)
    token = _current_user.set(user)
    try:
        result = get_current_user_optional()
        assert result is not None
        assert result.user_id == "abc"
    finally:
        _current_user.reset(token)


def test_context_isolation():
    """ContextVar 隔离：set/reset 不影响默认值"""
    # 默认应该是 None
    assert _current_user.get() is None

    user = UserContext(user_id="isolated", authenticated=True)
    token = _current_user.set(user)
    assert _current_user.get().user_id == "isolated"

    _current_user.reset(token)
    assert _current_user.get() is None
