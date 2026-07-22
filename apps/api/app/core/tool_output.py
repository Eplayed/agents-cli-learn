"""M18 MCP/tool output normalization.

Some MCP servers return content blocks whose text field is itself a JSON
string. This helper keeps the raw output and adds structured_output when safe.
"""
from __future__ import annotations

import json
from typing import Any

from app.core.secrets import redact_obj


def _try_json(value: str) -> Any | None:
    text = value.strip()
    if not text or text[0] not in "[{":
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def normalize_tool_output(raw: Any) -> dict:
    try:
        raw = raw.content
    except Exception:
        pass

    structured = None
    output = raw

    if isinstance(raw, str):
        structured = _try_json(raw)
    elif isinstance(raw, list):
        parsed_blocks = []
        changed = False
        for block in raw:
            if isinstance(block, dict) and isinstance(block.get("text"), str):
                inner = _try_json(block["text"])
                if inner is not None:
                    parsed_blocks.append({**block, "json": inner})
                    changed = True
                else:
                    parsed_blocks.append(block)
            else:
                parsed_blocks.append(block)
        if changed:
            structured = parsed_blocks
    elif isinstance(raw, (dict, list)):
        structured = raw

    return {
        "output": redact_obj(output),
        "structured_output": redact_obj(structured) if structured is not None else None,
    }
