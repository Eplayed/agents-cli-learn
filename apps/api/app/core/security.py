"""
密码哈希 + JWT 签发/验签（多用户鉴权）

- 密码哈希：用 bcrypt（venv 已含），自带每用户 salt + 慢哈希，抗彩虹表/暴力
- JWT：HS256，用 stdlib（hmac/hashlib/base64）实现，不引入新依赖
  说明：生产项目通常直接用 PyJWT/python-jose；这里手写是为了 ① 不加依赖
  ② 学习项目里把 JWT = base64url(header).base64url(payload).HMAC签名 讲清楚。
  签名密钥用 settings.SECRET_KEY（生产必须换成强随机值，见 config.py 校验）。
"""
import base64
import hashlib
import hmac
import json
import time
from typing import Optional

import bcrypt

from app.core.config import settings


# ============================================================
# 密码哈希（bcrypt）
# ============================================================
def hash_password(password: str) -> str:
    # bcrypt 只取前 72 字节，超长直接截断避免报错
    raw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


# ============================================================
# JWT（HS256，stdlib 实现）
# ============================================================
def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(seg: str) -> bytes:
    pad = "=" * (-len(seg) % 4)
    return base64.urlsafe_b64decode(seg + pad)


def _sign(signing_input: str) -> str:
    sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return _b64url_encode(sig)


def create_access_token(
    sub: str,
    username: str,
    role: str = "user",
    expires_minutes: Optional[int] = None,
) -> str:
    """签发一个 HS256 JWT。sub=用户 id，payload 带 username/role/iat/exp。"""
    now = int(time.time())
    ttl = settings.JWT_EXPIRE_MINUTES if expires_minutes is None else expires_minutes
    payload = {
        "sub": sub,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + ttl * 60,
    }
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = (
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        + "."
        + _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    )
    return signing_input + "." + _sign(signing_input)


def decode_access_token(token: str) -> Optional[dict]:
    """验签 + 校验过期。任意校验失败返回 None（调用方据此判 401）。"""
    if not token or token.count(".") != 2:
        return None
    header_seg, payload_seg, sig_seg = token.split(".")
    signing_input = f"{header_seg}.{payload_seg}"
    expected = _sign(signing_input)
    # 恒定时间比较，防签名时序侧信道
    if not hmac.compare_digest(expected, sig_seg):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_seg))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload
