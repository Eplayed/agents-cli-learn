import pytest

from app.core.memory import extract_memory_facts


def test_extract_memory_facts():
    facts = extract_memory_facts("请记住：我正在准备 Agent 应用工程师面试。以后请用简洁中文回答")
    values = [f.value for f in facts]
    assert any("Agent 应用工程师" in v for v in values)
    assert any("简洁中文" in v for v in values)


@pytest.mark.asyncio
async def test_memory_api_create_list_delete(client):
    created = await client.post("/api/v1/memory/", json={"key": "goal", "value": "准备 Agent 面试"})
    assert created.status_code == 200
    mem_id = created.json()["id"]

    listed = await client.get("/api/v1/memory/")
    assert listed.status_code == 200
    assert any(m["id"] == mem_id for m in listed.json()["memories"])

    deleted = await client.delete(f"/api/v1/memory/{mem_id}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True


@pytest.mark.asyncio
async def test_file_upload_text_pipeline(client):
    files = {"file": ("note.md", b"# Hello\nAgent file context.", "text/markdown")}
    uploaded = await client.post("/api/v1/files/upload", files=files)
    assert uploaded.status_code == 200
    body = uploaded.json()
    assert body["status"] == "processed"
    assert "Agent file context" in body["text_preview"]

    text = await client.get(f"/api/v1/files/{body['id']}/text")
    assert text.status_code == 200
    assert "Hello" in text.json()["text"]

    listed = await client.get("/api/v1/files/")
    assert listed.status_code == 200
    assert listed.json()["count"] >= 1
