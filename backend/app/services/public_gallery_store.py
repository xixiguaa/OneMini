"""公共创作画廊：发现页图片与短片，所有登录用户可见。"""

from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.services import create_history_store

PUBLIC_OWNER = "public"
VALID_TYPES = frozenset({"image", "video"})


def _history_dir() -> Path:
    base = Path(get_settings().secrets_file).resolve().parent / "create_history"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _gallery_path() -> Path:
    return _history_dir() / "public_gallery.json"


def _media_dir() -> Path:
    base = _history_dir() / "media" / PUBLIC_OWNER
    base.mkdir(parents=True, exist_ok=True)
    return base


def media_path(item_id: str) -> Path:
    safe_id = re.sub(r"[^\w\-]", "_", item_id)[:128]
    return _media_dir() / f"{safe_id}.bin"


def media_public_url(item_id: str) -> str:
    return f"/api/platform/create-history/public/media/{item_id}"


def media_exists(item_id: str) -> bool:
    return media_path(item_id).is_file()


def _load_raw() -> list[dict[str, Any]]:
    path = _gallery_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return []


def _normalize_item(raw: dict[str, Any]) -> dict[str, Any]:
    media_type = raw.get("type") or "image"
    if media_type not in VALID_TYPES:
        media_type = "image"
    item_id = str(raw.get("id") or "")
    url = raw.get("url") or raw.get("previewUrl")
    if item_id and media_exists(item_id):
        served = media_public_url(item_id)
        url = served
    return {
        "id": item_id,
        "prompt": str(raw.get("prompt") or ""),
        "title": str(raw.get("title") or ""),
        "description": str(raw.get("description") or ""),
        "type": media_type,
        "url": url,
        "previewUrl": url,
        "status": "DONE",
        "createdAt": int(raw.get("createdAt") or raw.get("created_at") or 0),
        "aspectRatio": raw.get("aspectRatio") or raw.get("aspect_ratio"),
    }


def list_items(media_type: str | None = None) -> list[dict[str, Any]]:
    items = [_normalize_item(i) for i in _load_raw() if i.get("id")]
    if media_type in VALID_TYPES:
        items = [i for i in items if i["type"] == media_type]
    return sorted(items, key=lambda x: x["createdAt"], reverse=True)


def contains_item(item_id: str) -> bool:
    return any(str(i.get("id") or "") == item_id for i in _load_raw())


def _save_raw(items: list[dict[str, Any]]) -> None:
    path = _gallery_path()
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def publish_item(
    user_id: str,
    item_id: str,
    *,
    title: str = "",
    description: str = "",
) -> dict[str, Any]:
    """将用户创作记录发布到公共画廊（复制媒体文件）。"""
    items = create_history_store.list_items(user_id)
    source = next((i for i in items if i.get("id") == item_id), None)
    if not source:
        raise ValueError("创作记录不存在")
    if source.get("status") != "DONE":
        raise ValueError("仅已完成的作品可发布")
    if source.get("type") not in VALID_TYPES:
        raise ValueError("不支持的媒体类型")

    user_media = create_history_store.media_path(user_id, item_id)
    if not user_media.is_file():
        raise ValueError("媒体尚未缓存，请稍后再试")

    public_media = media_path(item_id)
    public_media.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(user_media, public_media)

    record = {
        "id": item_id,
        "prompt": source.get("prompt") or "",
        "title": title,
        "description": description,
        "type": source.get("type") or "image",
        "url": media_public_url(item_id),
        "previewUrl": media_public_url(item_id),
        "status": "DONE",
        "createdAt": int(source.get("createdAt") or time.time() * 1000),
        "aspectRatio": source.get("aspectRatio"),
        "publishedBy": user_id,
    }

    gallery = _load_raw()
    idx = next((i for i, x in enumerate(gallery) if x.get("id") == item_id), -1)
    if idx >= 0:
        gallery[idx] = {**gallery[idx], **record}
    else:
        gallery.append(record)
    _save_raw(gallery)
    return _normalize_item(record)
