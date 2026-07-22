"""M16 文件处理链路 API。"""
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_optional
from app.core.database import get_db
from app.core.file_processing import delete_file_artifacts, list_user_files, save_and_process_upload
from app.core.memory import normalize_user_id
from app.models.models import UploadedFile

router = APIRouter()


def _current_uid() -> str:
    user = get_current_user_optional()
    return normalize_user_id(user.user_id if user else None)


def _serialize(record: UploadedFile) -> dict:
    return {
        "id": record.id,
        "user_id": record.user_id,
        "session_id": record.session_id,
        "filename": record.filename,
        "media_type": record.media_type,
        "size_bytes": record.size_bytes,
        "status": record.status,
        "error_message": record.error_message,
        "text_preview": record.text_preview,
        "created_at": record.created_at,
    }


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    record = await save_and_process_upload(db, file=file, user_id=_current_uid(), session_id=session_id)
    return _serialize(record)


@router.get("/")
async def list_files(session_id: str | None = None, limit: int = 50, db: AsyncSession = Depends(get_db)):
    rows = await list_user_files(db, _current_uid(), session_id=session_id, limit=limit)
    return {"files": [_serialize(r) for r in rows], "count": len(rows)}


@router.get("/{file_id}/text")
async def get_file_text(file_id: str, db: AsyncSession = Depends(get_db)):
    uid = _current_uid()
    record = await db.get(UploadedFile, file_id)
    if not record or record.user_id != uid:
        raise HTTPException(status_code=404, detail="File not found")
    if record.status != "processed" or not record.text_path:
        raise HTTPException(status_code=422, detail=record.error_message or "File text is not available")
    path = Path(record.text_path)
    return {"id": record.id, "filename": record.filename, "text": path.read_text(encoding="utf-8")}


@router.delete("/{file_id}")
async def delete_file(file_id: str, db: AsyncSession = Depends(get_db)):
    uid = _current_uid()
    record = await db.get(UploadedFile, file_id)
    if not record or record.user_id != uid:
        raise HTTPException(status_code=404, detail="File not found")
    delete_file_artifacts(record)
    await db.delete(record)
    await db.commit()
    return {"deleted": True}
