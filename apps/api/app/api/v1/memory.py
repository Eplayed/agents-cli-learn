"""M16 长期记忆 API。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_optional
from app.core.database import get_db
from app.core.memory import list_user_memories, normalize_user_id, upsert_memory
from app.models.models import UserMemory

router = APIRouter()


class MemoryCreateRequest(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=1000)
    category: str = Field(default="manual", max_length=50)
    session_id: str | None = None


def _current_uid() -> str:
    user = get_current_user_optional()
    return normalize_user_id(user.user_id if user else None)


def _serialize(mem: UserMemory) -> dict:
    return {
        "id": mem.id,
        "user_id": mem.user_id,
        "key": mem.key,
        "value": mem.value,
        "category": mem.category,
        "source": mem.source,
        "session_id": mem.session_id,
        "confidence": mem.confidence,
        "metadata": mem.metadata_ or {},
        "created_at": mem.created_at,
        "updated_at": mem.updated_at,
    }


@router.get("/")
async def get_memories(limit: int = 100, db: AsyncSession = Depends(get_db)):
    memories = await list_user_memories(db, _current_uid(), limit=limit)
    return {"memories": [_serialize(m) for m in memories], "count": len(memories)}


@router.post("/")
async def create_memory(body: MemoryCreateRequest, db: AsyncSession = Depends(get_db)):
    mem = await upsert_memory(
        db,
        user_id=_current_uid(),
        key=body.key,
        value=body.value,
        category=body.category,
        source="manual",
        session_id=body.session_id,
        confidence=1.0,
    )
    return _serialize(mem)


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, db: AsyncSession = Depends(get_db)):
    uid = _current_uid()
    mem = await db.get(UserMemory, memory_id)
    if not mem or mem.user_id != uid:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.delete(mem)
    await db.commit()
    return {"deleted": True}


@router.delete("/")
async def clear_memories(db: AsyncSession = Depends(get_db)):
    uid = _current_uid()
    result = await db.execute(delete(UserMemory).where(UserMemory.user_id == uid))
    await db.commit()
    return {"deleted": result.rowcount or 0}
