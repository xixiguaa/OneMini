"""LLM-Wiki 根目录路径（独立模块，避免 llm_wiki ↔ wiki_assets 循环导入）。"""

from __future__ import annotations

from pathlib import Path

from app.config import Settings, get_settings


def wiki_root(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    if settings.llm_wiki_path.strip():
        p = Path(settings.llm_wiki_path)
        if not p.is_absolute():
            p = Path(__file__).resolve().parents[2] / p
    else:
        p = Path(__file__).resolve().parents[2].parent / "llm-wiki"
    return p.resolve()
