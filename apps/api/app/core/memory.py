"""M16 长期记忆服务。

学习版目标：先做到用户隔离、可增删查、可注入 Agent prompt。
事实抽取先用确定性启发式，避免为了 MVP 再引入一次 LLM 调用。
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import UserMemory, utcnow


def normalize_user_id(user_id: str | None) -> str:
    return user_id or "anonymous"


@dataclass
class MemoryFact:
    key: str
    value: str
    category: str = "preference"
    confidence: float = 0.8


_MY_X_IS_RE = re.compile(r"(?:我的|我叫|我是)(?P<key>[\u4e00-\u9fa5A-Za-z0-9_ -]{1,20})[是叫:]?(?P<value>[^。！？\n]{1,80})")


def extract_memory_facts(text: str) -> list[MemoryFact]:
    """从用户输入里抽取可记忆事实。

    支持：
    - “记住：我喜欢中文回答”
    - “以后请用简洁风格”
    - “我的目标是 Agent 应用工程师”
    """
    raw = (text or "").strip()
    if not raw:
        return []

    facts: list[MemoryFact] = []
    if "记住" in raw:
        value = raw.split("记住", 1)[1].lstrip("：: ，,").strip()
        if value:
            facts.append(MemoryFact(key="user_note", value=value[:200], category="preference", confidence=0.9))

    if "以后" in raw and ("请" in raw or "用" in raw):
        facts.append(MemoryFact(key="future_preference", value=raw[:200], category="preference", confidence=0.75))

    m = _MY_X_IS_RE.search(raw)
    if m:
        key = m.group("key").strip(" ：:")
        value = m.group("value").strip(" ：:")
        if key and value and len(value) >= 2:
            facts.append(MemoryFact(key=key[:80], value=value[:200], category="profile", confidence=0.8))

    # 去重
    seen = set()
    unique: list[MemoryFact] = []
    for fact in facts:
        sig = (fact.key, fact.value)
        if sig not in seen:
            seen.add(sig)
            unique.append(fact)
    return unique


async def upsert_memory(
    db: AsyncSession,
    *,
    user_id: str | None,
    key: str,
    value: str,
    category: str = "manual",
    source: str = "manual",
    session_id: str | None = None,
    confidence: float = 0.8,
    metadata: dict | None = None,
) -> UserMemory:
    """按 user_id + key + value 幂等写入记忆。"""
    uid = normalize_user_id(user_id)
    stmt = select(UserMemory).where(
        UserMemory.user_id == uid,
        UserMemory.key == key,
        UserMemory.value == value,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        existing.updated_at = utcnow()
        existing.confidence = max(float(existing.confidence or 0), confidence)
        await db.commit()
        await db.refresh(existing)
        return existing

    mem = UserMemory(
        user_id=uid,
        key=key,
        value=value,
        category=category,
        source=source,
        session_id=session_id,
        confidence=confidence,
        metadata_=metadata or {},
    )
    db.add(mem)
    await db.commit()
    await db.refresh(mem)
    await trim_user_memories(db, uid)
    return mem


async def remember_from_message(db: AsyncSession, *, user_id: str | None, session_id: str | None, text: str) -> list[UserMemory]:
    if not settings.MEMORY_ENABLED:
        return []
    saved: list[UserMemory] = []
    for fact in extract_memory_facts(text):
        saved.append(
            await upsert_memory(
                db,
                user_id=user_id,
                key=fact.key,
                value=fact.value,
                category=fact.category,
                source="auto",
                session_id=session_id,
                confidence=fact.confidence,
            )
        )
    return saved


async def trim_user_memories(db: AsyncSession, user_id: str) -> None:
    max_facts = max(int(settings.MEMORY_MAX_FACTS_PER_USER), 1)
    stmt = select(UserMemory).where(UserMemory.user_id == user_id).order_by(desc(UserMemory.updated_at))
    rows = (await db.execute(stmt)).scalars().all()
    for row in rows[max_facts:]:
        await db.delete(row)
    if len(rows) > max_facts:
        await db.commit()


async def list_user_memories(db: AsyncSession, user_id: str | None, limit: int = 100) -> list[UserMemory]:
    uid = normalize_user_id(user_id)
    stmt = (
        select(UserMemory)
        .where(UserMemory.user_id == uid)
        .order_by(desc(UserMemory.updated_at))
        .limit(max(1, min(limit, 200)))
    )
    return list((await db.execute(stmt)).scalars().all())


def format_memory_context(memories: Iterable[UserMemory], max_chars: int | None = None) -> str:
    budget = max_chars or settings.MEMORY_MAX_INJECT_CHARS
    lines = []
    total = 0
    for mem in memories:
        line = f"- [{mem.category}] {mem.key}: {mem.value}"
        if total + len(line) > budget:
            break
        lines.append(line)
        total += len(line)
    if not lines:
        return ""
    return "\n\n以下是当前用户的长期记忆，请在不泄露隐私的前提下用于个性化回答：\n" + "\n".join(lines)


async def load_memory_context(user_id: str | None) -> str:
    if not settings.MEMORY_ENABLED:
        return ""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        memories = await list_user_memories(db, user_id, limit=50)
        return format_memory_context(memories)
