"""LLM-Wiki Lint：断链、孤儿页、未 published 来源等健康检查。"""

from __future__ import annotations

import re
from typing import Any

from app.config import Settings, get_settings
from app.services import llm_wiki

_WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")


def _resolve_link_target(root, target: str) -> bool:
    t = target.strip().replace("\\", "/")
    if not t:
        return False
    if t.endswith(".md"):
        t = t[:-3]
    if not t.startswith("wiki/"):
        for sub in ("concepts", "entities", "sources", "synthesis", "queries"):
            if llm_wiki.wiki_file_for_node_id(root, f"wiki/{sub}/{t}"):
                return True
            if llm_wiki.wiki_file_for_node_id(root, f"wiki/{sub}/{t.replace(' ', '-')}"):
                return True
        return False
    return llm_wiki.wiki_file_for_node_id(root, t) is not None


def run_wiki_lint(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)
    issues: list[dict[str, str]] = []

    orphans = llm_wiki.list_orphan_wiki_nodes(settings)
    for node in orphans[:50]:
        issues.append(
            {
                "kind": "orphan",
                "severity": "warn",
                "page": node.get("id", ""),
                "message": f"断链占位：{node.get('title', node.get('id'))}",
            }
        )

    wiki_dir = root / "wiki"
    broken = 0
    if wiki_dir.is_dir():
        for path in wiki_dir.rglob("*.md"):
            from app.services.wiki_index import is_protected_index_name

            if is_protected_index_name(path.name):
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            page_id = path.relative_to(root).as_posix()[:-3]
            for m in _WIKILINK_RE.finditer(text):
                target = m.group(1).strip()
                if target.startswith("http"):
                    continue
                if not _resolve_link_target(root, target):
                    broken += 1
                    if broken <= 40:
                        issues.append(
                            {
                                "kind": "broken_link",
                                "severity": "error",
                                "page": page_id,
                                "message": f"断链 [[{target}]]",
                            }
                        )

    pending = 0
    from app.services import wiki_ingest

    for rel in wiki_ingest.list_pending_raw(settings):
        pending += 1
        if pending <= 20:
            issues.append(
                {
                    "kind": "pending_raw",
                    "severity": "info",
                    "page": rel,
                    "message": "raw 尚未完成 ingest",
                }
            )

    errors = sum(1 for i in issues if i["severity"] == "error")
    warns = sum(1 for i in issues if i["severity"] == "warn")

    return {
        "ok": errors == 0,
        "summary": {
            "issues": len(issues),
            "errors": errors,
            "warnings": warns,
            "orphans": len(orphans),
            "pending_raw": pending,
        },
        "issues": issues,
    }
