"""M17 secret hygiene helpers."""
from __future__ import annotations

import re
from typing import Any


SECRET_KEYWORDS = ("api_key", "apikey", "secret", "token", "password", "passwd", "pwd", "authorization")
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{12,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.IGNORECASE),
]


def redact_secret(value: Any) -> Any:
    if value is None:
        return None
    text = str(value)
    redacted = text
    for pat in SECRET_PATTERNS:
        redacted = pat.sub("***REDACTED***", redacted)
    if redacted != text:
        return redacted
    if len(text) >= 12:
        return text[:3] + "***" + text[-4:]
    return "***"


def redact_obj(obj: Any) -> Any:
    """递归脱敏 dict/list，防止日志、trace、响应回显 secrets。"""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if any(word in str(k).lower() for word in SECRET_KEYWORDS):
                out[k] = redact_secret(v)
            else:
                out[k] = redact_obj(v)
        return out
    if isinstance(obj, list):
        return [redact_obj(v) for v in obj]
    if isinstance(obj, str):
        redacted = obj
        for pat in SECRET_PATTERNS:
            redacted = pat.sub("***REDACTED***", redacted)
        return redacted
    return obj
