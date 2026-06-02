"""用户 / 条目 ID 规范化（文件路径与 MinIO object key 共用）。"""

from __future__ import annotations

import re


def safe_user_id(user_id: str) -> str:
    uid = (user_id or "default").strip() or "default"
    return re.sub(r"[^\w\-]", "_", uid)[:64]


def safe_item_id(item_id: str) -> str:
    return re.sub(r"[^\w\-]", "_", item_id)[:128]
