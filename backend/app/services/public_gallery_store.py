"""公共创作画廊：PostgreSQL + MinIO。"""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select

from app.db.models import PublicGalleryItemRow
from app.db.session import get_session
from app.services import create_history_store, minio_storage

VALID_TYPES = frozenset({"image", "video"})


def media_public_url(item_id: str) -> str:
    return f"/api/platform/create-history/public/media/{item_id}"


def media_exists(item_id: str) -> bool:
    key = minio_storage.public_media_object_key(item_id)
    return minio_storage.exists(key)


def read_media_bytes(item_id: str) -> bytes | None:
    return minio_storage.get_bytes(minio_storage.public_media_object_key(item_id))


def _row_to_dict(row: PublicGalleryItemRow) -> dict[str, Any]:
    url = row.url or row.preview_url
    if row.id and media_exists(row.id):
        url = media_public_url(row.id)
    return {
        "id": row.id,
        "prompt": row.prompt or "",
        "title": row.title or "",
        "description": row.description or "",
        "type": row.media_type,
        "url": url,
        "previewUrl": url,
        "status": row.status or "DONE",
        "createdAt": row.created_at,
        "aspectRatio": row.aspect_ratio,
        "publishedBy": row.published_by,
    }


def list_items(media_type: str | None = None) -> list[dict[str, Any]]:
    with get_session() as session:
        rows = session.scalars(
            select(PublicGalleryItemRow).order_by(PublicGalleryItemRow.created_at.desc())
        ).all()
        items = [_row_to_dict(r) for r in rows if r.id]
    if media_type in VALID_TYPES:
        items = [i for i in items if i["type"] == media_type]
    return items


def contains_item(item_id: str) -> bool:
    with get_session() as session:
        return session.get(PublicGalleryItemRow, item_id) is not None


def publish_item(
    user_id: str,
    item_id: str,
    *,
    title: str = "",
    description: str = "",
) -> dict[str, Any]:
    items = create_history_store.list_items(user_id)
    source = next((i for i in items if i.get("id") == item_id), None)
    if not source:
        raise ValueError("创作记录不存在")
    if source.get("status") != "DONE":
        raise ValueError("仅已完成的作品可发布")
    if source.get("type") not in VALID_TYPES:
        raise ValueError("不支持的媒体类型")

    data = create_history_store.read_media_bytes(user_id, item_id)
    if not data:
        raise ValueError("媒体尚未缓存，请稍后再试")

    dest_key = minio_storage.public_media_object_key(item_id)
    minio_storage.put_bytes(dest_key, data, content_type=minio_storage.guess_media_type(data))
    served = media_public_url(item_id)
    record = {
        "id": item_id,
        "prompt": source.get("prompt") or "",
        "title": title,
        "description": description,
        "type": source.get("type") or "image",
        "url": served,
        "previewUrl": served,
        "status": "DONE",
        "createdAt": int(source.get("createdAt") or time.time() * 1000),
        "aspectRatio": source.get("aspectRatio"),
        "publishedBy": user_id,
    }

    with get_session() as session:
        row = session.get(PublicGalleryItemRow, item_id)
        if row is None:
            row = PublicGalleryItemRow(
                id=item_id,
                published_by=user_id,
                prompt=record["prompt"],
                title=title,
                description=description,
                media_type=record["type"],
                url=served,
                preview_url=served,
                status="DONE",
                created_at=record["createdAt"],
                aspect_ratio=record.get("aspectRatio"),
                storage_key=dest_key,
            )
            session.add(row)
        else:
            row.published_by = user_id
            row.prompt = record["prompt"]
            row.title = title
            row.description = description
            row.media_type = record["type"]
            row.url = served
            row.preview_url = served
            row.created_at = record["createdAt"]
            row.aspect_ratio = record.get("aspectRatio")
            row.storage_key = dest_key
        session.flush()
        return _row_to_dict(row)


def import_legacy_json(items: list[dict[str, Any]]) -> int:
    from pathlib import Path

    from app.config import get_settings
    from app.services.storage_ids import safe_item_id

    count = 0
    media_base = (
        Path(get_settings().secrets_file).resolve().parent
        / "create_history"
        / "media"
        / "public"
    )
    for raw in items:
        item_id = str(raw.get("id") or "")
        if not item_id:
            continue
        legacy = media_base / f"{safe_item_id(item_id)}.bin"
        if legacy.is_file() and not media_exists(item_id):
            blob = legacy.read_bytes()
            minio_storage.put_bytes(
                minio_storage.public_media_object_key(item_id),
                blob,
                content_type=minio_storage.guess_media_type(blob),
            )
        with get_session() as session:
            if session.get(PublicGalleryItemRow, item_id):
                continue
            served = media_public_url(item_id) if media_exists(item_id) else raw.get("url")
            row = PublicGalleryItemRow(
                id=item_id,
                published_by=str(raw.get("publishedBy") or "legacy"),
                prompt=str(raw.get("prompt") or ""),
                title=str(raw.get("title") or ""),
                description=str(raw.get("description") or ""),
                media_type=raw.get("type") or "image",
                url=served,
                preview_url=served,
                status="DONE",
                created_at=int(raw.get("createdAt") or raw.get("created_at") or 0),
                aspect_ratio=raw.get("aspectRatio"),
                storage_key=minio_storage.public_media_object_key(item_id)
                if media_exists(item_id)
                else None,
            )
            session.add(row)
            count += 1
    return count
