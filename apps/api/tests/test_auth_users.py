"""
多用户鉴权测试（M13）

- security 单元：密码哈希往返、JWT 签发/验签/防篡改/过期
- 端点：注册 → 登录 → /me；密码错误 401；重复注册 409
- 身份隔离：不同用户的 JWT 解析出不同 user_id（配额隔离的前提）
"""
import uuid

import pytest


# ---------------- security 单元 ----------------

def test_password_hash_roundtrip():
    from app.core.security import hash_password, verify_password

    h = hash_password("hunter2")
    assert h != "hunter2"  # 不存明文
    assert verify_password("hunter2", h)
    assert not verify_password("wrong", h)


def test_jwt_roundtrip():
    from app.core.security import create_access_token, decode_access_token

    token = create_access_token(sub="user_1", username="alice", role="admin")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user_1"
    assert payload["username"] == "alice"
    assert payload["role"] == "admin"


def test_jwt_tampered_rejected():
    from app.core.security import create_access_token, decode_access_token

    token = create_access_token(sub="user_1", username="alice")
    assert decode_access_token(token + "x") is None      # 篡改签名
    assert decode_access_token("a.b.c") is None           # 结构非法
    assert decode_access_token("") is None                # 空


def test_jwt_expired_rejected():
    from app.core.security import create_access_token, decode_access_token

    token = create_access_token(sub="user_1", username="alice", expires_minutes=-1)
    assert decode_access_token(token) is None


# ---------------- 端点流程 ----------------

@pytest.mark.asyncio
async def test_register_login_me(client):
    uname = f"u_{uuid.uuid4().hex[:8]}"

    r = await client.post("/api/v1/auth/register", json={"username": uname, "password": "secret123"})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["user"]["username"] == uname
    assert body["user"]["role"] == "user"

    r2 = await client.post("/api/v1/auth/login", json={"username": uname, "password": "secret123"})
    assert r2.status_code == 200
    token = r2.json()["access_token"]

    r3 = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    me = r3.json()
    assert me["username"] == uname
    assert me["role"] == "user"
    assert me["authenticated"] is True


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    uname = f"u_{uuid.uuid4().hex[:8]}"
    await client.post("/api/v1/auth/register", json={"username": uname, "password": "secret123"})
    r = await client.post("/api/v1/auth/login", json={"username": uname, "password": "wrongpass"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_duplicate_register(client):
    uname = f"u_{uuid.uuid4().hex[:8]}"
    await client.post("/api/v1/auth/register", json={"username": uname, "password": "secret123"})
    r = await client.post("/api/v1/auth/register", json={"username": uname, "password": "secret123"})
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_two_users_have_distinct_identity(client):
    """两个用户的 JWT 应解析出不同 user_id/username —— 配额按用户隔离的前提"""
    ua, ub = f"u_{uuid.uuid4().hex[:8]}", f"u_{uuid.uuid4().hex[:8]}"
    ta = (await client.post("/api/v1/auth/register", json={"username": ua, "password": "secret123"})).json()["access_token"]
    tb = (await client.post("/api/v1/auth/register", json={"username": ub, "password": "secret123"})).json()["access_token"]

    ma = (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {ta}"})).json()
    mb = (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tb}"})).json()

    assert ma["user_id"] != mb["user_id"]
    assert ma["username"] == ua and mb["username"] == ub
