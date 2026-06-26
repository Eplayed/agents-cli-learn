"""
图片/附件存储（多模态消息）

把用户上传的 Base64 图片落盘到 uploads/ 目录，返回可访问的 URL，
这样会话历史重新加载时能显示图片（而不只是文字）。

设计：
- 存储路径：apps/api/uploads/<session_id>/<uuid>.<ext>
- 访问 URL：/uploads/<session_id>/<uuid>.<ext>（由 main.py 挂载静态目录）
- 学习项目用本地磁盘；生产环境建议换 S3/MinIO
"""
import base64
import binascii
import uuid
from pathlib import Path
from typing import Optional


def get_uploads_dir() -> Path:
    """uploads 根目录"""
    return Path(__file__).resolve().parent.parent.parent / "uploads"


# MIME → 扩展名
_EXT_MAP = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}


def save_base64_image(data: str, media_type: str, session_id: str) -> Optional[str]:
    """保存单张 Base64 图片，返回可访问 URL（失败返回 None）"""
    try:
        raw = base64.b64decode(data)
    except (binascii.Error, ValueError):
        return None

    ext = _EXT_MAP.get((media_type or "image/png").lower(), "png")
    fname = f"{uuid.uuid4().hex}.{ext}"

    session_dir = get_uploads_dir() / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / fname).write_bytes(raw)

    return f"/uploads/{session_id}/{fname}"


def save_images(images, session_id: str) -> list[str]:
    """批量保存图片（images 为 ImageAttachment 列表），返回 URL 列表"""
    if not images:
        return []
    urls = []
    for img in images[:3]:  # 最多 3 张
        url = save_base64_image(img.data, img.media_type, session_id)
        if url:
            urls.append(url)
    return urls
