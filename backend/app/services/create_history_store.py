"""创作历史：按用户 JSON 文件持久化（data/create_history/{user_id}.json）。"""

from __future__ import annotations

import base64
import fcntl
import json
import re
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import quote

import httpx

from app.config import get_settings

VALID_STATUS = frozenset({"RUNNING", "DONE", "FAIL"})
VALID_TYPES = frozenset({"image", "video"})


def _safe_user_id(user_id: str) -> str:
    uid = (user_id or "default").strip() or "default"
    return re.sub(r"[^\w\-]", "_", uid)[:64]


def _history_dir() -> Path:
    base = Path(get_settings().secrets_file).resolve().parent / "create_history"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _user_path(user_id: str) -> Path:
    return _history_dir() / f"{_safe_user_id(user_id)}.json"


@contextmanager
def _user_lock(user_id: str) -> Iterator[None]:
    """按用户文件锁，避免并发 upsert 覆盖 JSON。"""
    lock_dir = _history_dir() / "locks"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_path = lock_dir / f"{_safe_user_id(user_id)}.lock"
    with open(lock_path, "a+b") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def _media_dir(user_id: str) -> Path:
    base = _history_dir() / "media" / _safe_user_id(user_id)
    base.mkdir(parents=True, exist_ok=True)
    return base


def media_path(user_id: str, item_id: str) -> Path:
    safe_id = re.sub(r"[^\w\-]", "_", item_id)[:128]
    return _media_dir(user_id) / f"{safe_id}.bin"


def media_public_url(_user_id: str, item_id: str) -> str:
    """客户端须在 URL 上附加 access_token（见 createHistoryMedia.ts）。"""
    return f"/api/platform/create-history/media/{item_id}"


def media_exists(user_id: str, item_id: str) -> bool:
    return media_path(user_id, item_id).is_file()


def _write_media_bytes(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def cache_media_from_url(user_id: str, item_id: str, url: str | None) -> bool:
    """下载远程图片到本地；已存在则跳过。data URL 亦支持。"""
    if not url or not item_id:
        return False
    if url.startswith("/api/platform/create-history/media/"):
        return media_exists(user_id, item_id)
    path = media_path(user_id, item_id)
    if path.is_file():
        return True
    try:
        if url.startswith("data:"):
            _, encoded = url.split(",", 1)
            _write_media_bytes(path, base64.b64decode(encoded))
            return True
        headers = {"User-Agent": "OneMini/1.0"}
        with httpx.Client(timeout=60.0, follow_redirects=True, headers=headers) as client:
            resp = client.get(url)
            resp.raise_for_status()
            _write_media_bytes(path, resp.content)
        return True
    except (httpx.HTTPError, OSError, ValueError):
        return False


def _apply_served_url_to_record(user_id: str, record: dict[str, Any]) -> dict[str, Any]:
    """若本地已缓存媒体，将记录中的 url 改写为可长期访问的代理地址。"""
    norm = _normalize_item(record)
    if norm.get("type") in ("image", "video") and media_exists(user_id, norm["id"]):
        served = media_public_url(user_id, norm["id"])
        return {**record, "url": served, "previewUrl": served}
    return record


def _finalize_item(user_id: str, record: dict[str, Any]) -> dict[str, Any]:
    """尝试缓存远程图片，并将可持久化的代理 URL 写回记录。"""
    norm = _normalize_item(record)
    _maybe_cache_item_media(user_id, norm)
    return _apply_served_url_to_record(user_id, {**record, **norm})


def _maybe_cache_item_media(user_id: str, item: dict[str, Any]) -> None:
    if item.get("type") not in ("image", "video"):
        return
    remote = item.get("url") or item.get("previewUrl")
    if remote and not media_exists(user_id, item["id"]):
        cache_media_from_url(user_id, item["id"], remote)


def _with_served_url(user_id: str, item: dict[str, Any]) -> dict[str, Any]:
    """若本地已缓存媒体，返回可长期访问的代理 URL。"""
    if item.get("type") in ("image", "video") and media_exists(user_id, item["id"]):
        served = media_public_url(user_id, item["id"])
        return {**item, "url": served, "previewUrl": served}
    return item


def _load_raw(user_id: str) -> list[dict[str, Any]]:
    path = _user_path(user_id)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return []


def _save_raw(user_id: str, items: list[dict[str, Any]]) -> None:
    path = _user_path(user_id)
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


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


def list_items(user_id: str) -> list[dict[str, Any]]:
    with _user_lock(user_id):
        raw_items = _load_raw(user_id)
        if not raw_items:
            return []
        finalized: list[dict[str, Any]] = []
        changed = False
        for raw in raw_items:
            if not raw.get("id"):
                continue
            next_record = _finalize_item(user_id, raw)
            if next_record.get("url") != raw.get("url") or next_record.get("previewUrl") != raw.get("previewUrl"):
                changed = True
            finalized.append(next_record)
        if changed:
            _save_raw(user_id, finalized)
        items = [_normalize_item(i) for i in finalized]
        return sorted(items, key=lambda x: x["createdAt"], reverse=True)


def upsert_item(user_id: str, raw: dict[str, Any]) -> dict[str, Any]:
    item = _normalize_item(raw)
    if not item["id"]:
        raise ValueError("缺少 id")
    with _user_lock(user_id):
        return _upsert_item_unlocked(user_id, item)


def _upsert_item_unlocked(user_id: str, item: dict[str, Any]) -> dict[str, Any]:
    items = _load_raw(user_id)
    idx = next((i for i, x in enumerate(items) if x.get("id") == item["id"]), -1)
    prev = items[idx] if idx >= 0 else {}
    url = item.get("url") or prev.get("url")
    preview_url = item.get("previewUrl") or prev.get("previewUrl") or url
    payload = {
        "id": item["id"],
        "prompt": item["prompt"] or prev.get("prompt") or "",
        "type": item["type"],
        "url": url,
        "previewUrl": preview_url,
        "jobId": item.get("jobId") or prev.get("jobId"),
        "status": item["status"] or prev.get("status") or "DONE",
        "modelId": item.get("modelId") or prev.get("modelId"),
        "modelName": item.get("modelName") or prev.get("modelName"),
        "createdAt": item["createdAt"] or prev.get("createdAt") or _now_ms(),
        "sessionId": item.get("sessionId") or prev.get("sessionId"),
        "parentId": item.get("parentId") or prev.get("parentId"),
        "aspectRatio": item.get("aspectRatio") or prev.get("aspectRatio"),
        "editAction": item.get("editAction") or prev.get("editAction"),
    }
    if idx >= 0:
        items[idx] = {**items[idx], **payload}
    else:
        items.append(payload)
    idx = next((i for i, x in enumerate(items) if x.get("id") == item["id"]), -1)
    finalized = _finalize_item(user_id, items[idx])
    items[idx] = finalized
    _save_raw(user_id, items)
    return _normalize_item(finalized)


def patch_item(user_id: str, item_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    with _user_lock(user_id):
        return _patch_item_unlocked(user_id, item_id, patch)


def _patch_item_unlocked(user_id: str, item_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    items = _load_raw(user_id)
    idx = next((i for i, x in enumerate(items) if x.get("id") == item_id), -1)
    if idx < 0:
        return None
    merged = {**items[idx], **patch, "id": item_id}
    finalized = _finalize_item(user_id, merged)
    items[idx] = finalized
    _save_raw(user_id, items)
    return _normalize_item(finalized)


def sync_items(user_id: str, incoming: list[dict[str, Any]]) -> dict[str, int]:
    """全量合并：以 incoming 更新/追加，保留服务端已有但客户端未传的条目。"""
    with _user_lock(user_id):
        return _sync_items_unlocked(user_id, incoming)


def _sync_items_unlocked(user_id: str, incoming: list[dict[str, Any]]) -> dict[str, int]:
    existing = {x["id"]: x for x in _load_raw(user_id) if x.get("id")}
    for raw in incoming or []:
        item = _normalize_item(raw)
        if not item["id"]:
            continue
        prev = existing.get(item["id"], {})
        existing[item["id"]] = {
            "id": item["id"],
            "prompt": item["prompt"] or prev.get("prompt") or "",
            "type": item["type"],
            "url": item.get("url") or prev.get("url"),
            "previewUrl": item.get("previewUrl") or prev.get("previewUrl") or item.get("url") or prev.get("url"),
            "jobId": item.get("jobId") or prev.get("jobId"),
            "status": item["status"] if item.get("status") else prev.get("status") or "DONE",
            "modelId": item.get("modelId") or prev.get("modelId"),
            "modelName": item.get("modelName") or prev.get("modelName"),
            "createdAt": item["createdAt"] or prev.get("createdAt") or _now_ms(),
            "sessionId": item.get("sessionId") or prev.get("sessionId"),
            "parentId": item.get("parentId") or prev.get("parentId"),
            "aspectRatio": item.get("aspectRatio") or prev.get("aspectRatio"),
            "editAction": item.get("editAction") or prev.get("editAction"),
        }
    merged = list(existing.values())
    finalized: list[dict[str, Any]] = []
    for raw in merged:
        finalized.append(_finalize_item(user_id, raw))
    _save_raw(user_id, finalized)
    return {"total": len(finalized)}


def _delete_item_media(user_id: str, item_id: str) -> None:
    path = media_path(user_id, item_id)
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass


def delete_session(user_id: str, session_id: str) -> int:
    with _user_lock(user_id):
        return _delete_session_unlocked(user_id, session_id)


def _delete_session_unlocked(user_id: str, session_id: str) -> int:
    items = _load_raw(user_id)
    before = len(items)
    removed_ids: list[str] = []
    kept: list[dict[str, Any]] = []
    for raw in items:
        norm = _normalize_item(raw)
        if _belongs_to_session(norm, session_id):
            removed_ids.append(str(raw.get("id") or norm["id"]))
        else:
            kept.append(raw)
    removed = before - len(kept)
    if removed:
        for item_id in removed_ids:
            if item_id:
                _delete_item_media(user_id, item_id)
        _save_raw(user_id, kept)
    return removed


def is_version_leaf(user_id: str, version_id: str) -> bool:
    with _user_lock(user_id):
        items = _load_raw(user_id)
        return not any(i.get("parentId") == version_id for i in items)


def _subtree_delete_order(items: list[dict[str, Any]], root_id: str) -> list[str]:
    by_id = {str(_normalize_item(raw)["id"]): _normalize_item(raw) for raw in items}
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
    with _user_lock(user_id):
        items = _load_raw(user_id)
        order = _subtree_delete_order(items, version_id)
        if not order:
            return False
        for vid in order:
            items = _load_raw(user_id)
            if not _delete_version_unlocked(user_id, vid, items):
                return False
        return True


def delete_version(user_id: str, version_id: str) -> bool:
    with _user_lock(user_id):
        items = _load_raw(user_id)
        if any(i.get("parentId") == version_id for i in items):
            return False
        return _delete_version_unlocked(user_id, version_id, items)


def _delete_version_unlocked(user_id: str, version_id: str, items: list[dict[str, Any]]) -> bool:
    before = len(items)
    items = [i for i in items if i.get("id") != version_id]
    if len(items) == before:
        return False
    _delete_item_media(user_id, version_id)
    _save_raw(user_id, items)
    return True
