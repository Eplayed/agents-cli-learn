"""
内容安全（M14 子目标 B）

送 LLM / 落库前对用户输入做两件事：
1. PII 脱敏：手机号 / 身份证 / 银行卡 / 邮箱 → 保留可辨识的头尾，中间打码
   （合规要求：敏感个人信息不应明文进入 LLM 上下文、日志、数据库）
2. 敏感词拦截：命中拦截词表则直接拒绝，不调用 LLM

设计成可插拔：scan_sensitive 预留 provider 接口，未来可换成阿里云 Green 等云端审核；
默认用本地词表，零依赖、可离线跑、便于测试。
"""
import re
from dataclasses import dataclass, field
from typing import Optional

from app.core.config import settings


# ============================================================
# PII 脱敏规则（顺序有讲究：先匹配长/带非数字的，避免互相误吞）
# ============================================================
# 邮箱：保留首字符 + @域名  → a***@example.com
_RE_EMAIL = re.compile(r"([A-Za-z0-9])[A-Za-z0-9._%+\-]*(@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})")
# 身份证：18 位（末位可为 X）→ 前 6 + 后 4，中间 8 位打码
_RE_IDCARD = re.compile(r"(?<!\d)(\d{6})\d{8}(\d{3}[\dXx])(?!\d)")
# 银行卡：13-19 位纯数字 → 前 4 + 后 4
_RE_BANKCARD = re.compile(r"(?<!\d)(\d{4})\d{5,11}(\d{4})(?!\d)")
# 手机号：中国大陆 11 位 → 前 3 + 后 4
_RE_PHONE = re.compile(r"(?<!\d)(1[3-9]\d)\d{4}(\d{4})(?!\d)")


def mask_pii(text: str) -> tuple[str, bool]:
    """对文本做 PII 脱敏，返回 (脱敏后文本, 是否发生脱敏)。"""
    if not text:
        return text, False

    masked = text
    masked = _RE_EMAIL.sub(r"\1***\2", masked)
    # 身份证先于银行卡（都含在长数字里，先把 18 位身份证吃掉）
    masked = _RE_IDCARD.sub(r"\1********\2", masked)
    masked = _RE_BANKCARD.sub(lambda m: f"{m.group(1)}{'*' * (len(m.group(0)) - 8)}{m.group(2)}", masked)
    masked = _RE_PHONE.sub(r"\1****\2", masked)
    return masked, masked != text


# ============================================================
# 敏感词扫描（可插拔 provider）
# ============================================================
def _builtin_sensitive_words() -> list[str]:
    """默认拦截词表：内置若干占位示例 + config 里的自定义词（逗号分隔）。

    学习项目用占位词演示机制；生产可把 provider 换成云端审核（阿里云 Green 等）。
    """
    words: list[str] = ["测试违禁词", "banned_demo"]
    extra = (getattr(settings, "SENSITIVE_WORDS", "") or "").strip()
    if extra:
        words.extend(w.strip() for w in extra.split(",") if w.strip())
    return words


def scan_sensitive(text: str) -> list[str]:
    """返回命中的敏感词列表（空列表表示未命中）。"""
    if not text:
        return []
    lowered = text.lower()
    hits = []
    for w in _builtin_sensitive_words():
        if w and w.lower() in lowered:
            hits.append(w)
    return hits


# ============================================================
# 统一入口
# ============================================================
@dataclass
class SafetyResult:
    allowed: bool                 # 是否放行（命中拦截词则 False）
    text: str                     # 脱敏后的文本（放行时用它送 LLM/落库）
    pii_masked: bool = False      # 是否发生了 PII 脱敏
    sensitive_hits: list[str] = field(default_factory=list)
    reason: Optional[str] = None  # 被拒时的友好提示


def check_input(text: str) -> SafetyResult:
    """内容安全总入口：先查敏感词（拒绝优先），再做 PII 脱敏。

    关闭开关（CONTENT_SAFETY_ENABLED=false）时原样放行，行为不变。
    """
    if not getattr(settings, "CONTENT_SAFETY_ENABLED", True):
        return SafetyResult(allowed=True, text=text)

    hits = scan_sensitive(text)
    if hits:
        return SafetyResult(
            allowed=False,
            text=text,
            sensitive_hits=hits,
            reason="您的输入包含不被允许的内容，请修改后重试。",
        )

    masked, changed = mask_pii(text)
    return SafetyResult(allowed=True, text=masked, pii_masked=changed)
