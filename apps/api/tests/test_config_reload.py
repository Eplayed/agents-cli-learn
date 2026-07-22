"""
配置热更新 + 字段分级测试（M15 子目标 B）
"""
import pytest

from app.core.config_reload import classify_fields, reload_hot_config, RESTART_ONLY_FIELDS


def test_classify_fields():
    c = classify_fields()
    # 重启字段全部归类正确
    for f in RESTART_ONLY_FIELDS:
        assert f in c["restart_only_fields"]
        assert f not in c["hot_fields"]
    # 典型热字段
    assert "OPENAI_MODEL" in c["hot_fields"]
    assert "RATE_LIMIT_MAX_REQUESTS" in c["hot_fields"]


def test_reload_updates_hot_field(monkeypatch):
    from app.core.config import settings
    # 把热字段在内存里改脏，reload 应从 .env 重新读回（不等于脏值）
    monkeypatch.setattr(settings, "OPENAI_MODEL", "TAMPERED-model")
    report = reload_hot_config()
    assert settings.OPENAI_MODEL != "TAMPERED-model"       # 已被重载覆盖
    assert "OPENAI_MODEL" in report["reloaded"]


def test_reload_does_not_apply_restart_only(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "DATABASE_URL", "sqlite+aiosqlite:///./TAMPERED.db")
    report = reload_hot_config()
    # 重启字段：只提示 needs_restart，不原地应用（保持脏值直到重启）
    assert "DATABASE_URL" in report["needs_restart"]
    assert settings.DATABASE_URL == "sqlite+aiosqlite:///./TAMPERED.db"


def test_reload_masks_secret(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-TAMPERED")
    report = reload_hot_config()
    if "OPENAI_API_KEY" in report["reloaded"]:
        assert report["changed_hot"]["OPENAI_API_KEY"] == "***(changed)"  # 不回显密钥


@pytest.mark.asyncio
async def test_admin_config_endpoint(client):
    r = await client.get("/api/v1/admin/config")
    assert r.status_code == 200
    body = r.json()
    assert "hot_fields" in body and "restart_only_fields" in body
    assert "DATABASE_URL" in body["restart_only_fields"]


@pytest.mark.asyncio
async def test_admin_reload_endpoint(client):
    r = await client.post("/api/v1/admin/config/reload")
    assert r.status_code == 200
    body = r.json()
    assert "reloaded" in body and "needs_restart" in body
