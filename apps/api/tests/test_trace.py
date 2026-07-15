"""
全链路 Trace-ID 中间件测试（M12 P1）

验证：
- 每个响应都带 X-Trace-Id / X-Request-Id 响应头
- 入站带了 X-Trace-Id → 复用回传（跨服务/多请求关联）
- 入站没带 → 自动生成，且两次请求的 trace_id 不同
- 入站带了 X-Request-Id → 复用回传
"""
import pytest


@pytest.mark.asyncio
async def test_response_has_trace_headers(client):
    """任意响应都应带 trace / request 头"""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Trace-Id"), "响应缺少 X-Trace-Id"
    assert resp.headers.get("X-Request-Id"), "响应缺少 X-Request-Id"


@pytest.mark.asyncio
async def test_inbound_trace_id_is_reused(client):
    """入站带 X-Trace-Id 时应原样复用，便于串联上游调用"""
    incoming = "trace_fixedvalue123456"
    resp = await client.get("/health", headers={"X-Trace-Id": incoming})
    assert resp.headers.get("X-Trace-Id") == incoming


@pytest.mark.asyncio
async def test_inbound_request_id_is_reused(client):
    """入站带 X-Request-Id 时应原样复用"""
    incoming = "req_fixedvalue123456"
    resp = await client.get("/health", headers={"X-Request-Id": incoming})
    assert resp.headers.get("X-Request-Id") == incoming


@pytest.mark.asyncio
async def test_generated_trace_ids_are_unique(client):
    """不带入站头时，两次请求应生成不同的 trace_id"""
    r1 = await client.get("/health")
    r2 = await client.get("/health")
    t1 = r1.headers.get("X-Trace-Id")
    t2 = r2.headers.get("X-Trace-Id")
    assert t1 and t2
    assert t1 != t2, "自动生成的 trace_id 不应重复"


@pytest.mark.asyncio
async def test_trace_id_present_on_api_endpoint(client):
    """业务 API 端点同样带 trace 头（覆盖非 health 路径）"""
    resp = await client.get("/api/v1/models")
    assert resp.status_code == 200
    assert resp.headers.get("X-Trace-Id")
    assert resp.headers.get("X-Request-Id")
