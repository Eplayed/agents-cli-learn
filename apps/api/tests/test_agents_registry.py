"""
场景测试 4：Agent 注册中心
"""
import pytest
from app.agents.registry import get_agent, list_agents, get_default_key


def test_list_agents_returns_all():
    """注册中心有 ≥5 个 agent"""
    agents = list_agents()
    assert len(agents) >= 5
    keys = [a["key"] for a in agents]
    assert "basic-chatbot" in keys
    assert "tool-agent" in keys
    assert "mcp-agent" in keys
    assert "multi-agent" in keys
    assert "hitl-agent" in keys


def test_get_default_key():
    """默认 key 是 mcp-agent"""
    assert get_default_key() == "mcp-agent"


def test_get_agent_creates_instance():
    """能通过 key 创建 agent 实例"""
    agent = get_agent("basic-chatbot", session_id="test-session")
    assert agent is not None
    assert hasattr(agent, "stream")


def test_get_agent_invalid_key():
    """无效 key 抛 KeyError"""
    with pytest.raises(KeyError):
        get_agent("nonexistent", session_id="test")


def test_agent_entries_have_required_fields():
    """每个 agent entry 有必须字段"""
    agents = list_agents()
    for a in agents:
        assert "key" in a
        assert "name" in a
        assert "description" in a
        assert "milestone" in a
        assert a["milestone"] in ("M0", "M3", "M4", "M5", "M6", "M8", "M9", "Full")
