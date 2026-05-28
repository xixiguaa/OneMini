"""分类目录 index-*.md 与总目录 index.md。"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Any

_TYPE_DIRS = ("sources", "concepts", "entities", "synthesis", "queries")
_FACET_FILES: dict[str, tuple[str, str]] = {
    "sources": ("index-sources.md", "来源摘要"),
    "concepts": ("index-concepts.md", "概念"),
    "entities": ("index-entities.md", "实体"),
    "synthesis": ("index-synthesis.md", "综合论述"),
    "queries": ("index-queries.md", "查询沉淀"),
}
_MASTER_LABELS = {
    "sources": "来源摘要",
    "concepts": "概念",
    "entities": "实体",
    "synthesis": "综合论述",
    "queries": "查询沉淀",
}


def is_protected_index_name(name: str) -> bool:
    return name == "index.md" or name == "log.md" or (
        name.startswith("index-") and name.endswith(".md")
    )


def _one_line_summary(text: str) -> str:
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and not line.startswith("-"):
            if line.startswith(">"):
                return line.lstrip("> ").strip()[:80]
        if line.startswith("- ") and "待补充" not in line:
            return line[2:][:80]
    return ""


def collect_wiki_groups(root: Path) -> dict[str, list[tuple[str, str, str]]]:
    groups: dict[str, list[tuple[str, str, str]]] = {d: [] for d in _TYPE_DIRS}
    for sub in _TYPE_DIRS:
        dir_path = root / "wiki" / sub
        if not dir_path.is_dir():
            continue
        for path in sorted(dir_path.glob("*.md")):
            text = path.read_text(encoding="utf-8", errors="replace")
            title = path.stem
            m = re.search(r"^title:\s*(.+?)\s*$", text, re.MULTILINE)
            if m:
                title = m.group(1).strip().strip('"').strip("'")
            node_id = path.relative_to(root).as_posix()[:-3]
            groups[sub].append((title, node_id, _one_line_summary(text)))
    return groups


def _render_facet_markdown(
    label: str,
    facet_key: str,
    entries: list[tuple[str, str, str]],
    today: str,
) -> str:
    facet_file, _ = _FACET_FILES[facet_key]
    parts = [
        "---\n",
        f"title: {label}索引\n",
        "type: meta\n",
        f"facet: {facet_key}\n",
        f"updated: {today}\n",
        "---\n\n",
        f"# {label}索引\n\n",
        f"> 分类目录 `wiki/{facet_file}`，共 {len(entries)} 条。更新于 {today}。\n\n",
    ]
    if not entries:
        parts.append("_暂无_\n")
        return "".join(parts)
    for title, node_id, one_line in entries:
        suffix = f" — {one_line}" if one_line else ""
        parts.append(f"- [[{node_id}|{title}]]{suffix}\n")
    return "".join(parts)


def rebuild_wiki_index(root: Path) -> dict[str, Any]:
    """生成 wiki/index-*.md 分类目录与 wiki/index.md 总目录。"""
    groups = collect_wiki_groups(root)
    today = date.today().isoformat()
    wiki_dir = root / "wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)

    facet_stats: dict[str, int] = {}
    for sub, (fname, label) in _FACET_FILES.items():
        content = _render_facet_markdown(label, sub, groups[sub], today)
        (wiki_dir / fname).write_text(content, encoding="utf-8")
        facet_stats[sub] = len(groups[sub])

    total = sum(facet_stats.values())
    master = [
        "---\n",
        "title: LLM-Wiki 目录\n",
        "type: meta\n",
        f"updated: {today}\n",
        "---\n\n",
        "# LLM-Wiki 目录\n\n",
        f"> 总目录。共 {total} 篇 wiki 页；按类型分的分类目录见下方链接。生成于 {today}。\n\n",
        "## 分类目录（按类型）\n\n",
    ]
    for sub, (fname, label) in _FACET_FILES.items():
        count = facet_stats[sub]
        facet_id = f"wiki/{fname[:-3]}"
        master.append(f"- [[{facet_id}|{label}]]（{count}）\n")

    master.append("\n## 类型一览\n\n")
    for sub in _TYPE_DIRS:
        label = _MASTER_LABELS[sub]
        entries = groups[sub]
        master.append(f"### {label}（{len(entries)}）\n\n")
        if not entries:
            master.append("_详见对应分类目录_\n\n")
            continue
        for title, node_id, one_line in entries[:8]:
            suffix = f" — {one_line}" if one_line else ""
            master.append(f"- [[{node_id}|{title}]]{suffix}\n")
        if len(entries) > 8:
            fname = _FACET_FILES[sub][0]
            master.append(f"- … 另有 {len(entries) - 8} 条，见 [[wiki/{fname[:-3]}]]\n")
        master.append("\n")

    (wiki_dir / "index.md").write_text("".join(master), encoding="utf-8")
    return {"total": total, "facets": facet_stats, "updated": today}
