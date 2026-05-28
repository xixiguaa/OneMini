"""Ingest 冲突检测与 A/B/C _resolution（保留双方 / 覆盖 / 放弃）。"""

from __future__ import annotations

import difflib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.config import Settings, get_settings
from app.services import llm_wiki

_CONFLICTS_FILE = ".ingest-conflicts.json"
_MIN_BODY_LEN = 100
_MERGE_SIM_LOW = 0.42
_MERGE_SIM_HIGH = 0.78

Resolution = Literal["overwrite", "discard", "keep_both"]


def _conflicts_path(root: Path) -> Path:
    return root / _CONFLICTS_FILE


def _read_conflicts_store(root: Path) -> dict[str, Any]:
    path = _conflicts_path(root)
    if not path.is_file():
        return {"conflicts": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("conflicts"), list):
            return data
    except json.JSONDecodeError:
        pass
    return {"conflicts": []}


def _write_conflicts_store(root: Path, store: dict[str, Any]) -> None:
    _conflicts_path(root).write_text(
        json.dumps(store, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def list_ingest_conflicts(settings: Settings | None = None) -> list[dict[str, Any]]:
    root = llm_wiki.wiki_root(settings)
    return list(_read_conflicts_store(root).get("conflicts", []))


def _split_frontmatter(content: str) -> tuple[str, str]:
    if not content.startswith("---\n"):
        return "", content
    end = content.find("\n---\n", 4)
    if end == -1:
        return "", content
    return content[4:end], content[end + 5 :]


def _normalize_body(text: str) -> str:
    body = _split_frontmatter(text)[1]
    body = re.sub(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]", r"\1", body)
    body = re.sub(r"\s+", " ", body.strip().lower())
    return body


def body_similarity(existing: str, proposed: str) -> float:
    a = _normalize_body(existing)
    b = _normalize_body(proposed)
    if not a or not b:
        return 1.0 if a == b else 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _is_stub_content(content: str) -> bool:
    body = _split_frontmatter(content)[1].strip()
    if len(body) < 80:
        return True
    markers = ("待补充", "待 Agent", "（待补充）")
    return any(m in body for m in markers)


def classify_update(existing: str, proposed: str) -> Literal["new", "safe_overwrite", "merge", "conflict"]:
    """判断写入策略。"""
    if not existing.strip():
        return "new"
    if _is_stub_content(existing):
        return "safe_overwrite"
    sim = body_similarity(existing, proposed)
    ex_body = _split_frontmatter(existing)[1]
    pr_body = _split_frontmatter(proposed)[1]
    if len(ex_body.strip()) < _MIN_BODY_LEN or len(pr_body.strip()) < _MIN_BODY_LEN:
        return "safe_overwrite"
    if sim >= _MERGE_SIM_HIGH:
        return "safe_overwrite"
    if sim >= _MERGE_SIM_LOW:
        return "merge"
    return "conflict"


def _merge_bodies(existing: str, proposed: str, raw_rel: str) -> str:
    """无冲突时的增量合并：保留旧文并追加本次 ingest 摘要。"""
    fm, old_body = _split_frontmatter(existing)
    _, new_body = _split_frontmatter(proposed)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    merged_body = (
        old_body.rstrip()
        + f"\n\n## 增量更新 ({today})\n\n"
        + f"> 来源：`{raw_rel}`\n\n"
        + new_body.strip()[:3500]
    )
    if fm:
        return f"---\n{fm}\n---\n{merged_body}\n"
    return merged_body + "\n"


def _alt_path_for_keep_both(wiki_rel: str, raw_rel: str) -> str:
    p = Path(wiki_rel)
    slug = llm_wiki._slugify(Path(raw_rel).stem)[:40]
    return str(p.parent / f"{p.stem}-alt-{slug}{p.suffix}").replace("\\", "/")


def _add_conflict(
    root: Path,
    *,
    raw_rel: str,
    wiki_rel: str,
    proposed_content: str,
    existing_content: str,
    similarity: float,
) -> dict[str, Any]:
    store = _read_conflicts_store(root)
    _, existing_body = _split_frontmatter(existing_content)
    _, proposed_body = _split_frontmatter(proposed_content)
    title_m = re.search(r"^title:\s*(.+?)\s*$", proposed_content, re.MULTILINE)
    title = title_m.group(1).strip().strip("'\"") if title_m else Path(wiki_rel).stem

    entry = {
        "id": uuid.uuid4().hex[:12],
        "raw": raw_rel,
        "wiki_path": wiki_rel,
        "title": title,
        "similarity": round(similarity, 3),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "existing_preview": existing_body.strip()[:600],
        "proposed_preview": proposed_body.strip()[:600],
        "proposed_content": proposed_content,
    }
    store["conflicts"] = [
        c
        for c in store.get("conflicts", [])
        if not (c.get("wiki_path") == wiki_rel and c.get("raw") == raw_rel)
    ]
    store["conflicts"].append(entry)
    _write_conflicts_store(root, store)
    return entry


def apply_wiki_file_update(
    root: Path,
    wiki_rel: str,
    proposed_content: str,
    raw_rel: str,
    *,
    policy: str = "ask",
) -> dict[str, Any]:
    """
  写入单页。返回 action: written | merged | conflict | skipped
    """
    dest = root / wiki_rel
    if not dest.is_file():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(
            proposed_content + ("\n" if not proposed_content.endswith("\n") else ""),
            encoding="utf-8",
        )
        node_id = wiki_rel[:-3] if wiki_rel.endswith(".md") else wiki_rel
        return {"action": "written", "path": wiki_rel, "node_id": node_id}

    existing = dest.read_text(encoding="utf-8", errors="replace")
    kind = classify_update(existing, proposed_content)
    sim = body_similarity(existing, proposed_content)

    if kind == "conflict":
        if policy == "overwrite":
            dest.write_text(
                proposed_content + ("\n" if not proposed_content.endswith("\n") else ""),
                encoding="utf-8",
            )
            node_id = wiki_rel[:-3] if wiki_rel.endswith(".md") else wiki_rel
            return {"action": "overwritten", "path": wiki_rel, "node_id": node_id}
        if policy == "discard":
            node_id = wiki_rel[:-3] if wiki_rel.endswith(".md") else wiki_rel
            return {"action": "kept_existing", "path": wiki_rel, "node_id": node_id}
        entry = _add_conflict(
            root,
            raw_rel=raw_rel,
            wiki_rel=wiki_rel,
            proposed_content=proposed_content,
            existing_content=existing,
            similarity=sim,
        )
        return {"action": "conflict", "conflict_id": entry["id"], "path": wiki_rel}

    if kind == "merge":
        merged = _merge_bodies(existing, proposed_content, raw_rel)
        dest.write_text(merged + ("\n" if not merged.endswith("\n") else ""), encoding="utf-8")
        node_id = wiki_rel[:-3] if wiki_rel.endswith(".md") else wiki_rel
        return {"action": "merged", "path": wiki_rel, "node_id": node_id}

    dest.write_text(
        proposed_content + ("\n" if not proposed_content.endswith("\n") else ""),
        encoding="utf-8",
    )
    node_id = wiki_rel[:-3] if wiki_rel.endswith(".md") else wiki_rel
    return {"action": "written", "path": wiki_rel, "node_id": node_id}


def resolve_conflict(
    conflict_id: str,
    resolution: Resolution,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    root = llm_wiki.wiki_root(settings)
    store = _read_conflicts_store(root)
    conflicts = store.get("conflicts", [])
    entry = next((c for c in conflicts if c.get("id") == conflict_id), None)
    if not entry:
        raise ValueError(f"未找到冲突项: {conflict_id}")

    wiki_rel = str(entry["wiki_path"])
    proposed = str(entry.get("proposed_content", ""))
    raw_rel = str(entry.get("raw", ""))
    result: dict[str, Any] = {"id": conflict_id, "resolution": resolution, "wiki_path": wiki_rel}

    if resolution == "discard":
        result["action"] = "kept_existing"
    elif resolution == "overwrite":
        dest = root / wiki_rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(
            proposed + ("\n" if not proposed.endswith("\n") else ""),
            encoding="utf-8",
        )
        result["action"] = "overwritten"
        result["node_id"] = wiki_rel[:-3]
    elif resolution == "keep_both":
        alt_rel = _alt_path_for_keep_both(wiki_rel, raw_rel)
        dest = root / alt_rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(
            proposed + ("\n" if not proposed.endswith("\n") else ""),
            encoding="utf-8",
        )
        result["action"] = "kept_both"
        result["alt_path"] = alt_rel
        result["node_id"] = alt_rel[:-3]
    else:
        raise ValueError(f"未知 resolution: {resolution}")

    store["conflicts"] = [c for c in conflicts if c.get("id") != conflict_id]
    _write_conflicts_store(root, store)
    return result
