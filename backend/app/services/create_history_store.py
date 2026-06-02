"""创作历史：PostgreSQL 元数据 + MinIO 媒体；Milvus 不参与。"""

from __future__ import annotations

import base64
import re
import time
from pathlib import Path
from typing import Any
import httpx
from sqlalchemy import func, select

from app.config import get_settings
from app.db.models import CreateHistoryItemRow
from app.db.session import get_session
from app.services import minio_storage
from app.services.storage_ids import safe_item_id, safe_user_id

VALID_STATUS = frozenset({"RUNNING", "DONE", "FAIL"})
VALID_TYPES = frozenset({"image", "video"})

_safe_user_id = safe_user_id
_safe_item_id = safe_item_id


def _history_dir() -> Path:
    base = Path(get_settings().secrets_file).resolve().parent / "create_history"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _legacy_media_path(user_id: str, item_id: str) -> Path:
    base = _history_dir() / "media" / _safe_user_id(user_id)
    return base / f"{_safe_item_id(item_id)}.bin"


def media_path(user_id: str, item_id: str) -> Path:
    """兼容旧代码：优先返回本地遗留路径（迁移期）；新媒体在 MinIO。"""
    return _legacy_media_path(user_id, item_id)


def media_public_url(_user_id: str, item_id: str) -> str:
    return f"/api/platform/create-history/media/{item_id}"


def _storage_key(user_id: str, item_id: str) -> str:
    return minio_storage.user_media_object_key(user_id, item_id)


def media_exists(user_id: str, item_id: str) -> bool:
    key = _storage_key(user_id, item_id)
    if minio_storage.exists(key):
        return True
    return _legacy_media_path(user_id, item_id).is_file()


def read_media_bytes(user_id: str, item_id: str) -> bytes | None:
    key = _storage_key(user_id, item_id)
    data = minio_storage.get_bytes(key)
    if data:
        return data
    legacy = _legacy_media_path(user_id, item_id)
    if legacy.is_file():
        return legacy.read_bytes()
    return None


def _row_to_dict(row: CreateHistoryItemRow) -> dict[str, Any]:
    user_id = row.user_id
    item_id = row.id
    served = None
    if row.media_type in VALID_TYPES and media_exists(user_id, item_id):
        served = media_public_url(user_id, item_id)
    url = served or row.url or row.preview_url
    return {
        "id": row.id,
        "prompt": row.prompt or "",
        "type": row.media_type,
        "url": url,
        "previewUrl": served or row.preview_url or row.url,
        "jobId": row.job_id,
        "status": row.status,
        "modelId": row.model_id,
        "modelName": row.model_name,
        "createdAt": row.created_at,
        "sessionId": row.session_id,
        "parentId": row.parent_id,
        "aspectRatio": row.aspect_ratio,
        "editAction": row.edit_action,
    }


def _normalize_item(raw: dict[str, Any]) -> dict[str, Any]:
    media_type = raw.get("type") or raw.get("media_type") or "image"
    if media_type not in VALID_TYPES:
        media_type = "image"
    status = raw.get("status") or "DONE"
    if status not in VALID_STATUS:
        status = "DONE"
    return {
        "id": str(raw.get("id") or ""),
        "prompt": str(raw.get("prompt") or ""),
        "type": media_type,
        "url": raw.get("url") or raw.get("previewUrl") or raw.get("preview_url"),
        "previewUrl": raw.get("previewUrl") or raw.get("preview_url") or raw.get("url"),
        "jobId": raw.get("jobId") or raw.get("job_id"),
        "status": status,
        "modelId": raw.get("modelId") or raw.get("model_id"),
        "modelName": raw.get("modelName") or raw.get("model_name"),
        "createdAt": int(raw.get("createdAt") or raw.get("created_at") or _now_ms()),
        "sessionId": raw.get("sessionId") or raw.get("session_id"),
        "parentId": raw.get("parentId") or raw.get("parent_id"),
        "aspectRatio": raw.get("aspectRatio") or raw.get("aspect_ratio"),
        "editAction": raw.get("editAction") or raw.get("edit_action"),
    }


def _now_ms() -> int:
    return int(time.time() * 1000)


def _belongs_to_session(item: dict[str, Any], session_id: str) -> bool:
    sid = item.get("sessionId") or item.get("id")
    return item.get("sessionId") == session_id or item.get("id") == session_id or sid == session_id


def _write_media_bytes(user_id: str, item_id: str, content: bytes) -> str:
    key = _storage_key(user_id, item_id)
    minio_storage.put_bytes(key, content, content_type=minio_storage.guess_media_type(content))
    return key


def cache_media_from_url(user_id: str, item_id: str, url: str | None) -> bool:
    if not url or not item_id:
        return False
    if url.startswith("/api/platform/create-history/media/"):
        return media_exists(user_id, item_id)
    if media_exists(user_id, item_id):
        return True
    try:
        if url.startswith("data:"):
            _, encoded = url.split(",", 1)
            _write_media_bytes(user_id, item_id, base64.b64decode(encoded))
            return True
        headers = {"User-Agent": "OneMini/1.0"}
        with httpx.Client(timeout=60.0, follow_redirects=True, headers=headers) as client:
            resp = client.get(url)
            resp.raise_for_status()
            _write_media_bytes(user_id, item_id, resp.content)
        return True
    except (httpx.HTTPError, OSError, ValueError):
        return False


def _maybe_cache_item_media(user_id: str, item: dict[str, Any]) -> None:
    if item.get("type") not in VALID_TYPES:
        return
    remote = item.get("url") or item.get("previewUrl")
    if remote and not media_exists(user_id, item["id"]):
        cache_media_from_url(user_id, item["id"], remote)


def _apply_served_url(user_id: str, record: dict[str, Any]) -> dict[str, Any]:
    norm = _normalize_item(record)
    if norm.get("type") in VALID_TYPES and media_exists(user_id, norm["id"]):
        served = media_public_url(user_id, norm["id"])
        return {**record, **norm, "url": served, "previewUrl": served}
    return {**record, **norm}


def _finalize_item(user_id: str, record: dict[str, Any]) -> dict[str, Any]:
    norm = _normalize_item(record)
    _maybe_cache_item_media(user_id, norm)
    return _apply_served_url(user_id, {**record, **norm})


def _upsert_row(session, user_id: str, item: dict[str, Any], prev: dict[str, Any] | None = None) -> CreateHistoryItemRow:
    prev = prev or {}
    url = item.get("url") or prev.get("url")
    preview_url = item.get("previewUrl") or prev.get("previewUrl") or url
    row = session.get(CreateHistoryItemRow, item["id"])
    storage_key = row.storage_key if row else None
    if not storage_key and media_exists(user_id, item["id"]):
        storage_key = _storage_key(user_id, item["id"])
    payload = {
        "id": item["id"],
        "user_id": user_id,
        "prompt": item.get("prompt") or prev.get("prompt") or "",
        "media_type": item["type"],
        "url": url,
        "preview_url": preview_url,
        "job_id": item.get("jobId") or prev.get("jobId"),
        "status": item.get("status") or prev.get("status") or "DONE",
        "model_id": item.get("modelId") or prev.get("modelId"),
        "model_name": item.get("modelName") or prev.get("modelName"),
        "created_at": item.get("createdAt") or prev.get("createdAt") or _now_ms(),
        "session_id": item.get("sessionId") or prev.get("sessionId"),
        "parent_id": item.get("parentId") or prev.get("parentId"),
        "aspect_ratio": item.get("aspectRatio") or prev.get("aspectRatio"),
        "edit_action": item.get("editAction") or prev.get("editAction"),
        "storage_key": storage_key,
    }
    if row is None:
        row = CreateHistoryItemRow(**payload)
        session.add(row)
    else:
        for k, v in payload.items():
            setattr(row, k, v)
    session.flush()
    finalized = _finalize_item(user_id, _row_to_dict(row))
    row.url = finalized.get("url")
    row.preview_url = finalized.get("previewUrl")
    if media_exists(user_id, item["id"]):
        row.storage_key = _storage_key(user_id, item["id"])
    session.flush()
    return row


def list_items(user_id: str) -> list[dict[str, Any]]:
    with get_session() as session:
        rows = session.scalars(
            select(CreateHistoryItemRow)
            .where(CreateHistoryItemRow.user_id == user_id)
            .order_by(CreateHistoryItemRow.created_at.desc())
        ).all()
        out: list[dict[str, Any]] = []
        changed = False
        for row in rows:
            raw = _row_to_dict(row)
            finalized = _finalize_item(user_id, raw)
            if finalized.get("url") != raw.get("url") or finalized.get("previewUrl") != raw.get("previewUrl"):
                row.url = finalized.get("url")
                row.preview_url = finalized.get("previewUrl")
                if media_exists(user_id, row.id):
                    row.storage_key = _storage_key(user_id, row.id)
                changed = True
            out.append(finalized)
        if changed:
            session.flush()
        return out


def upsert_item(user_id: str, raw: dict[str, Any]) -> dict[str, Any]:
    item = _normalize_item(raw)
    if not item["id"]:
        raise ValueError("缺少 id")
    with get_session() as session:
        prev_row = session.get(CreateHistoryItemRow, item["id"])
        if prev_row and prev_row.user_id != user_id:
            raise ValueError("创作记录 id 已属于其他用户")
        prev = _row_to_dict(prev_row) if prev_row else {}
        row = _upsert_row(session, user_id, item, prev)
        return _finalize_item(user_id, _row_to_dict(row))


def patch_item(user_id: str, item_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with get_session() as session:
        row = session.get(CreateHistoryItemRow, item_id)
        if not row or row.user_id != user_id:
            return None
        merged = {**_row_to_dict(row), **patch, "id": item_id}
        item = _normalize_item(merged)
        row = _upsert_row(session, user_id, item, _row_to_dict(row))
        return _finalize_item(user_id, _row_to_dict(row))


def sync_items(user_id: str, incoming: list[dict[str, Any]]) -> dict[str, int]:
    with get_session() as session:
        existing = {
            r.id: _row_to_dict(r)
            for r in session.scalars(
                select(CreateHistoryItemRow).where(CreateHistoryItemRow.user_id == user_id)
            ).all()
        }
        for raw in incoming or []:
            item = _normalize_item(raw)
            if not item["id"]:
                continue
            prev = existing.get(item["id"], {})
            merged = {
                **prev,
                **item,
                "prompt": item["prompt"] or prev.get("prompt") or "",
                "url": item.get("url") or prev.get("url"),
                "previewUrl": item.get("previewUrl") or prev.get("previewUrl") or item.get("url") or prev.get("url"),
            }
            row = _upsert_row(session, user_id, merged, prev)
            existing[item["id"]] = _finalize_item(user_id, _row_to_dict(row))
        total = session.scalar(
            select(func.count())
            .select_from(CreateHistoryItemRow)
            .where(CreateHistoryItemRow.user_id == user_id)
        )
        return {"total": int(total or 0)}


def _delete_item_media(user_id: str, item_id: str) -> None:
    key = _storage_key(user_id, item_id)
    minio_storage.delete_object(key)
    legacy = _legacy_media_path(user_id, item_id)
    try:
        if legacy.is_file():
            legacy.unlink()
    except OSError:
        pass


def delete_session(user_id: str, session_id: str) -> int:
    with get_session() as session:
        rows = session.scalars(
            select(CreateHistoryItemRow).where(CreateHistoryItemRow.user_id == user_id)
        ).all()
        removed_ids: list[str] = []
        kept: list[CreateHistoryItemRow] = []
        for row in rows:
            norm = _row_to_dict(row)
            if _belongs_to_session(norm, session_id):
                removed_ids.append(row.id)
                session.delete(row)
            else:
                kept.append(row)
        removed = len(removed_ids)
        if removed:
            session.flush()
            for item_id in removed_ids:
                _delete_item_media(user_id, item_id)
        return removed


def is_version_leaf(user_id: str, version_id: str) -> bool:
    with get_session() as session:
        hit = session.scalar(
            select(CreateHistoryItemRow.id)
            .where(
                CreateHistoryItemRow.user_id == user_id,
                CreateHistoryItemRow.parent_id == version_id,
            )
            .limit(1)
        )
        return hit is None


def _subtree_delete_order(session, user_id: str, root_id: str) -> list[str]:
    rows = session.scalars(
        select(CreateHistoryItemRow).where(CreateHistoryItemRow.user_id == user_id)
    ).all()
    by_id = {r.id: _row_to_dict(r) for r in rows}
    if root_id not in by_id:
        return []
    order: list[str] = []

    def walk(version_id: str) -> None:
        for item in by_id.values():
            if item.get("parentId") == version_id:
                walk(str(item["id"]))
        order.append(version_id)

    walk(root_id)
    return order


def delete_version_cascade(user_id: str, version_id: str) -> bool:
    with get_session() as session:
        order = _subtree_delete_order(session, user_id, version_id)
        if not order:
            return False
    for vid in order:
        if not delete_version(user_id, vid):
            return False
    return True


def delete_version(user_id: str, version_id: str) -> bool:
    with get_session() as session:
        if any(
            r.parent_id == version_id
            for r in session.scalars(
                select(CreateHistoryItemRow).where(CreateHistoryItemRow.user_id == user_id)
            ).all()
        ):
            return False
        row = session.get(CreateHistoryItemRow, version_id)
        if not row or row.user_id != user_id:
            return False
        session.delete(row)
        session.flush()
    _delete_item_media(user_id, version_id)
    return True


def import_legacy_user_file(user_id: str, items: list[dict[str, Any]]) -> int:
    """从 JSON 文件导入单用户创作记录并上传遗留本地媒体到 MinIO。"""
    count = 0
    for raw in items:
        if not raw.get("id"):
            continue
        item = _normalize_item(raw)
        legacy = _legacy_media_path(user_id, item["id"])
        if legacy.is_file() and not media_exists(user_id, item["id"]):
            _write_media_bytes(user_id, item["id"], legacy.read_bytes())
        upsert_item(user_id, item)
        count += 1
    return count
