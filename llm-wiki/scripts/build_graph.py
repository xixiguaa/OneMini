#!/usr/bin/env python3
"""
从 llm-wiki/wiki/**/*.md 解析 [[wikilink]]，生成 graph/links.json。

用法（仓库根目录）:
  python3 llm-wiki/scripts/build_graph.py
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]")
FRONTMATTER_TYPE_RE = re.compile(r"^type:\s*(\S+)\s*$", re.MULTILINE)
FRONTMATTER_TITLE_RE = re.compile(r"^title:\s*(.+?)\s*$", re.MULTILINE)

ROOT = Path(__file__).resolve().parents[1]
WIKI_DIR = ROOT / "wiki"
GRAPH_FILE = ROOT / "graph" / "links.json"

_DIR_TYPE = {
    "sources": "source",
    "concepts": "concept",
    "entities": "entity",
    "synthesis": "synthesis",
    "queries": "query",
}


def slug_to_id(slug: str) -> str:
    s = slug.strip().replace("\\", "/")
    if s.endswith(".md"):
        s = s[:-3]
    if not s.startswith("wiki/"):
        if s.startswith("entities/") or s.startswith("concepts/") or s.startswith("sources/") or s.startswith("synthesis/") or s.startswith("queries/"):
            s = f"wiki/{s}"
        elif s in ("overview", "index", "log"):
            s = f"wiki/{s}"
        elif "/" not in s:
            s = f"wiki/concepts/{s}"  # 裸链接默认概念目录（lint 时可修正）
    return s


def parse_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        return "", text
    end = text.find("\n---\n", 4)
    if end == -1:
        return "", text
    return text[4:end], text[end + 5 :]


def _infer_type_from_path(rel_path: str, fallback: str = "unknown") -> str:
    parts = Path(rel_path.replace("\\", "/")).parts
    if len(parts) >= 2 and parts[0] == "wiki":
        return _DIR_TYPE.get(parts[1], fallback)
    return fallback


def _find_wiki_file(node_id: str) -> Path | None:
    """按 node_id 查找 wiki 页，支持大小写不一致（macOS）。"""
    direct = ROOT / f"{node_id}.md"
    if direct.is_file():
        return direct
    parent = direct.parent
    if not parent.is_dir():
        return None
    target = direct.stem.lower()
    for candidate in parent.iterdir():
        if candidate.suffix.lower() == ".md" and candidate.stem.lower() == target:
            return candidate
    return None


def page_meta(path: Path, body: str) -> dict:
    fm, _ = parse_frontmatter(path.read_text(encoding="utf-8"))
    ptype = "meta"
    title = path.stem
    if m := FRONTMATTER_TYPE_RE.search(fm):
        ptype = m.group(1)
    if m := FRONTMATTER_TITLE_RE.search(fm):
        title = m.group(1).strip().strip('"').strip("'")
    rel = path.relative_to(ROOT).as_posix()
    node_id = rel[:-3] if rel.endswith(".md") else rel
    if ptype in ("meta", "unknown"):
        ptype = _infer_type_from_path(rel, ptype)
    return {"id": node_id, "title": title, "type": ptype, "path": rel}


def strip_code_regions(text: str) -> str:
    """移除代码块与行内代码，避免把文档示例里的 [[...]] 当成链接。"""
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`]*`", "", text)
    return text


def collect_wikilinks(body: str) -> list[str]:
    cleaned = strip_code_regions(body)
    return [m.group(1).strip() for m in WIKILINK_RE.finditer(cleaned)]


def resolve_target(slug: str, source_path: Path) -> str | None:
    """将 wikilink 解析为 wiki 内相对路径 id。"""
    slug = slug.strip()
    if slug.startswith("../"):
        return None
    candidates: list[Path] = []
    if "/" in slug:
        candidates.append(WIKI_DIR.parent / slug)
        candidates.append(WIKI_DIR / slug)
    else:
        candidates.append(source_path.parent / f"{slug}.md")
        for sub in ("entities", "concepts", "sources", "synthesis", "queries"):
            candidates.append(WIKI_DIR / sub / f"{slug}.md")
        candidates.append(WIKI_DIR / f"{slug}.md")

    for c in candidates:
        try:
            c = c.resolve()
            if c.is_file() and c.is_relative_to(ROOT):
                rel = c.relative_to(ROOT).as_posix()
                return rel[:-3] if rel.endswith(".md") else rel
        except (OSError, ValueError):
            continue
    guessed = slug_to_id(slug)
    found = _find_wiki_file(guessed)
    if found:
        rel = found.relative_to(ROOT).as_posix()
        return rel[:-3] if rel.endswith(".md") else rel
    return guessed


def main() -> None:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    seen_edges: set[tuple[str, str]] = set()

    md_files = sorted(WIKI_DIR.rglob("*.md"))
    for path in md_files:
        if path.name.startswith("."):
            continue
        text = path.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(text)
        meta = page_meta(path, body)
        nodes[meta["id"]] = meta

        for link in collect_wikilinks(body):
            target_id = resolve_target(link, path)
            if not target_id:
                continue
            if target_id not in nodes:
                found = _find_wiki_file(target_id)
                if found:
                    nodes[target_id] = page_meta(found, "")
                else:
                    nodes[target_id] = {
                        "id": target_id,
                        "title": link.split("/")[-1],
                        "type": _infer_type_from_path(f"{target_id}.md", "unknown"),
                        "path": f"{target_id}.md",
                        "orphan": True,
                    }
            pair = (meta["id"], target_id)
            if pair not in seen_edges:
                seen_edges.add(pair)
                edges.append(
                    {
                        "source": meta["id"],
                        "target": target_id,
                        "type": "wikilink",
                    }
                )

    payload = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator": "llm-wiki/scripts/build_graph.py",
        "description": "从 wiki Markdown 的 [[wikilink]] 解析；与 Milvus RAG 无关",
        "nodes": sorted(nodes.values(), key=lambda n: n["id"]),
        "edges": edges,
    }
    GRAPH_FILE.parent.mkdir(parents=True, exist_ok=True)
    GRAPH_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['nodes'])} nodes, {len(payload['edges'])} edges → {GRAPH_FILE}")


if __name__ == "__main__":
    main()
