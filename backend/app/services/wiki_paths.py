"""LLM-Wiki 根目录路径（独立模块，避免 llm_wiki ↔ wiki_assets 循环导入）。"""

from __future__ import annotations

import re
from pathlib import Path

from app.config import Settings, get_settings
from app.context import current_user_id


def _global_wiki_base(settings: Settings) -> Path:
    if settings.llm_wiki_path.strip():
        p = Path(settings.llm_wiki_path)
        if not p.is_absolute():
            p = Path(__file__).resolve().parents[2] / p
    else:
        p = Path(__file__).resolve().parents[2].parent / "llm-wiki"
    return p.resolve()


def _safe_user_id(user_id: str) -> str:
    return re.sub(r"[^\w\-]", "_", (user_id or "").strip())[:64] or "anonymous"


def wiki_root(settings: Settings | None = None, user_id: str | None = None) -> Path:
    """按用户隔离：{base}/users/{user_id}/…"""
    settings = settings or get_settings()
    base = _global_wiki_base(settings)
    uid = (user_id or current_user_id.get() or "").strip()
    if not uid:
        raise RuntimeError("wiki_root 需要已登录用户上下文")
    root = (base / "users" / _safe_user_id(uid)).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root
