"""首次启动时从 data/*.json 与本地媒体目录迁移到 PostgreSQL + MinIO。"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from sqlalchemy import func, select

from app.config import get_settings
from app.db.models import CreateHistoryItemRow, PublicGalleryItemRow, UserRow
from app.db.session import get_session
from app.services import create_history_store, public_gallery_store, users_store


def _data_dir() -> Path:
    return Path(get_settings().secrets_file).resolve().parent


def _users_json_path() -> Path:
    return _data_dir() / "users.json"


def _create_history_dir() -> Path:
    return _data_dir() / "create_history"


def _gallery_json_path() -> Path:
    return _create_history_dir() / "public_gallery.json"


def _safe_user_file(user_id: str) -> str:
    return re.sub(r"[^\w\-]", "_", user_id)[:64] + ".json"


def run_legacy_import_if_needed() -> dict[str, int]:
    """表为空且存在旧 JSON 时自动导入。"""
    stats = {"users": 0, "create_history_users": 0, "create_history_items": 0, "public_gallery": 0}

    with get_session() as session:
        user_count = session.scalar(select(func.count()).select_from(UserRow)) or 0
        create_count = session.scalar(select(func.count()).select_from(CreateHistoryItemRow)) or 0
        gallery_count = session.scalar(select(func.count()).select_from(PublicGalleryItemRow)) or 0

    if user_count == 0 and _users_json_path().is_file():
        try:
            data = json.loads(_users_json_path().read_text(encoding="utf-8"))
            if isinstance(data, dict):
                stats["users"] = users_store.import_legacy_json(
                    data.get("users") or {},
                    data.get("email_index") or {},
                    data.get("phone_index") or {},
                )
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[WARN] 用户 JSON 迁移跳过: {exc}")

    hist_dir = _create_history_dir()
    if create_count == 0 and hist_dir.is_dir():
        for path in hist_dir.glob("*.json"):
            if path.name == "public_gallery.json":
                continue
            user_key = path.stem
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(raw, list):
                    continue
                n = create_history_store.import_legacy_user_file(user_key, raw)
                if n:
                    stats["create_history_users"] += 1
                    stats["create_history_items"] += n
            except (json.JSONDecodeError, OSError) as exc:
                print(f"[WARN] 创作历史迁移跳过 {path.name}: {exc}")

    if gallery_count == 0 and _gallery_json_path().is_file():
        try:
            raw = json.loads(_gallery_json_path().read_text(encoding="utf-8"))
            if isinstance(raw, list):
                stats["public_gallery"] = public_gallery_store.import_legacy_json(raw)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"[WARN] 公共画廊迁移跳过: {exc}")

    return stats
