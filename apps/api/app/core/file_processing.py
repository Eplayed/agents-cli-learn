"""M16 文件上传、存储与文本化。

学习版先支持稳定的文本类文件；PDF/Office 如本地安装了解析库则自动使用，
未安装时返回明确错误，不让 UI 假装成功。
"""
from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.memory import normalize_user_id
from app.models.models import UploadedFile


TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".json", ".csv", ".log", ".py", ".js", ".ts", ".tsx", ".vue", ".html", ".css", ".yaml", ".yml"}


def get_files_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "uploads" / "files"


def allowed_extensions() -> set[str]:
    return {e.strip().lower() for e in settings.FILE_UPLOAD_ALLOWED_EXTENSIONS.split(",") if e.strip()}


def _safe_filename(name: str) -> str:
    candidate = Path(name or "upload.txt").name
    return candidate.replace("/", "_").replace("\\", "_")[:180] or "upload.txt"


def _decode_text(raw: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def extract_text(path: Path, filename: str) -> tuple[str, str | None]:
    ext = Path(filename).suffix.lower()
    raw = path.read_bytes()
    if ext in TEXT_EXTENSIONS:
        if ext == ".json":
            try:
                return json.dumps(json.loads(_decode_text(raw)), ensure_ascii=False, indent=2), None
            except json.JSONDecodeError:
                return _decode_text(raw), None
        return _decode_text(raw), None

    if ext == ".pdf":
        try:
            from pypdf import PdfReader  # type: ignore
            reader = PdfReader(str(path))
            return "\n\n".join(page.extract_text() or "" for page in reader.pages), None
        except Exception as exc:
            return "", f"PDF 解析不可用或失败：{exc}"

    if ext == ".docx":
        try:
            from docx import Document  # type: ignore
            doc = Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs), None
        except Exception as exc:
            return "", f"Word 解析不可用或失败：{exc}"

    return "", f"暂不支持该文件类型：{ext or 'unknown'}"


async def save_and_process_upload(
    db: AsyncSession,
    *,
    file: UploadFile,
    user_id: str | None,
    session_id: str | None = None,
) -> UploadedFile:
    uid = normalize_user_id(user_id)
    filename = _safe_filename(file.filename or "upload.txt")
    ext = Path(filename).suffix.lower()
    if ext not in allowed_extensions():
        record = UploadedFile(
            user_id=uid,
            session_id=session_id,
            filename=filename,
            media_type=file.content_type,
            size_bytes=0,
            storage_path="",
            status="failed",
            error_message=f"文件类型不允许：{ext or 'unknown'}",
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record

    root = get_files_dir() / uid
    root.mkdir(parents=True, exist_ok=True)
    file_id = f"file_{uuid.uuid4().hex[:16]}"
    storage_path = root / f"{file_id}_{filename}"

    size = 0
    with storage_path.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > settings.FILE_UPLOAD_MAX_BYTES:
                out.close()
                storage_path.unlink(missing_ok=True)
                record = UploadedFile(
                    id=file_id,
                    user_id=uid,
                    session_id=session_id,
                    filename=filename,
                    media_type=file.content_type,
                    size_bytes=size,
                    storage_path="",
                    status="failed",
                    error_message=f"文件超过大小限制：{settings.FILE_UPLOAD_MAX_BYTES} bytes",
                )
                db.add(record)
                await db.commit()
                await db.refresh(record)
                return record
            out.write(chunk)

    text, error = extract_text(storage_path, filename)
    text_path = None
    preview = None
    status = "processed"
    if error:
        status = "failed"
    else:
        text_path_obj = storage_path.with_suffix(storage_path.suffix + ".txt")
        text_path_obj.write_text(text, encoding="utf-8")
        text_path = str(text_path_obj)
        preview = text[:1000]

    record = UploadedFile(
        id=file_id,
        user_id=uid,
        session_id=session_id,
        filename=filename,
        media_type=file.content_type,
        size_bytes=size,
        storage_path=str(storage_path),
        text_path=text_path,
        text_preview=preview,
        status=status,
        error_message=error,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def list_user_files(db: AsyncSession, user_id: str | None, session_id: str | None = None, limit: int = 50) -> list[UploadedFile]:
    uid = normalize_user_id(user_id)
    stmt = select(UploadedFile).where(UploadedFile.user_id == uid).order_by(desc(UploadedFile.created_at)).limit(max(1, min(limit, 100)))
    if session_id:
        stmt = stmt.where(UploadedFile.session_id == session_id)
    return list((await db.execute(stmt)).scalars().all())


async def load_recent_file_context(user_id: str | None, session_id: str | None = None) -> str:
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        files = await list_user_files(db, user_id, session_id=session_id, limit=3)
    lines = []
    for f in files:
        if f.status == "processed" and f.text_preview:
            lines.append(f"文件 {f.filename} 摘要：\n{f.text_preview[:800]}")
    if not lines:
        return ""
    return "\n\n以下是用户最近上传并已转文本的文件上下文，可用于回答：\n" + "\n\n".join(lines)


def delete_file_artifacts(record: UploadedFile) -> None:
    root = get_files_dir().resolve()
    for raw in (record.storage_path, record.text_path):
        if raw:
            path = Path(raw).resolve()
            if root in path.parents:
                path.unlink(missing_ok=True)
    parent = Path(record.storage_path).parent if record.storage_path else None
    if parent:
        resolved_parent = parent.resolve()
        if root in resolved_parent.parents and resolved_parent.exists() and not any(resolved_parent.iterdir()):
            shutil.rmtree(resolved_parent, ignore_errors=True)
