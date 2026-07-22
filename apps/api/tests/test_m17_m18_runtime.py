import pytest

from app.core.secrets import redact_obj
from app.core.smart_routing import route_agent
from app.core.tool_output import normalize_tool_output


def test_secret_redaction_recursive():
    redacted = redact_obj({"api_key": "sk-very-secret-token-123456", "nested": {"Authorization": "Bearer abc.def"}})
    assert redacted["api_key"] != "sk-very-secret-token-123456"
    assert redacted["nested"]["Authorization"] != "Bearer abc.def"


def test_smart_routing_code_prompt():
    agent, reason = route_agent("请帮我修复这个 pytest 报错")
    assert agent == "code-agent"
    assert reason == "code_keywords"


def test_tool_output_double_json():
    raw = [{"type": "text", "text": "{\"city\":\"上海\",\"temp\":28}"}]
    normalized = normalize_tool_output(raw)
    assert normalized["output"] == raw
    assert normalized["structured_output"][0]["json"]["city"] == "上海"


def test_tool_output_plain_string_not_parsed():
    normalized = normalize_tool_output("hello world")
    assert normalized["output"] == "hello world"
    assert normalized["structured_output"] is None


@pytest.mark.asyncio
async def test_metrics_endpoint(client):
    await client.get("/health")
    res = await client.get("/api/v1/admin/metrics")
    assert res.status_code == 200
    assert "noah_http_requests_total" in res.text


@pytest.mark.asyncio
async def test_route_preview_endpoint(client):
    res = await client.post("/api/v1/admin/route-preview", json={"message": "帮我看代码报错"})
    assert res.status_code == 200
    assert res.json()["selected_agent"] == "code-agent"


@pytest.mark.asyncio
async def test_scheduled_task_api_create_trigger_runs(client):
    created = await client.post(
        "/api/v1/scheduled/",
        json={"name": "smoke", "prompt": "hello", "interval_seconds": 60, "max_runs": 1},
    )
    assert created.status_code == 200
    task_id = created.json()["id"]

    listed = await client.get("/api/v1/scheduled/")
    assert listed.status_code == 200
    assert any(t["id"] == task_id for t in listed.json()["tasks"])

    triggered = await client.post(f"/api/v1/scheduled/{task_id}/trigger")
    assert triggered.status_code == 200
    assert triggered.json()["triggered"] is True

    runs = await client.get(f"/api/v1/scheduled/{task_id}/runs")
    assert runs.status_code == 200
    assert runs.json()["count"] >= 1

    paused = await client.post(f"/api/v1/scheduled/{task_id}/pause")
    assert paused.status_code == 200
    resumed = await client.post(f"/api/v1/scheduled/{task_id}/resume")
    assert resumed.status_code == 200
