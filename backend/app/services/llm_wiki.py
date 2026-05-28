"""LLM-Wiki 文件系统与图谱（与 Milvus RAG 无关）。"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import Settings, get_settings
from app.services.raw_extract import (
    ALLOWED_RAW_SUFFIXES,
    EXTRACTABLE_SUFFIXES,
    extract_sidecar_rel,
    extract_text,
    is_allowed_suffix,
    normalize_text_content,
)
from app.services.wiki_assets import normalize_markdown_images
from app.services.wiki_paths import wiki_root

_SOURCES_RE = re.compile(r"^sources:\s*\n((?:\s+-\s+.+\n)+)", re.MULTILINE)
_FRONTMATTER_TYPE_RE = re.compile(r"^type:\s*(\S+)\s*$", re.MULTILINE)
_FRONTMATTER_TITLE_RE = re.compile(r"^title:\s*(.+?)\s*$", re.MULTILINE)
_SKIP_RAW_NAMES = {".gitkeep", ".ds_store"}
_TEXT_PREVIEW_SUFFIXES = ALLOWED_RAW_SUFFIXES - EXTRACTABLE_SUFFIXES
_WIKI_DIR_TYPE = {
    "sources": "source",
    "concepts": "concept",
    "entities": "entity",
    "synthesis": "synthesis",
    "queries": "query",
}


def _ensure_layout(root: Path) -> None:
    for rel in (
        "raw",
        "raw/09-archive",
        "raw/archive",
        "raw/assets",
        "raw/external",
        "raw/uploads",
        "wiki/entities",
        "wiki/concepts",
        "wiki/sources",
        "wiki/synthesis",
        "wiki/queries",
        "graph",
    ):
        (root / rel).mkdir(parents=True, exist_ok=True)


def _safe_relative_path(raw: str) -> Path:
    p = Path(raw.replace("\\", "/").strip().lstrip("/"))
    if ".." in p.parts:
        raise HTTPException(400, "非法路径")
    return p


def _parse_wiki_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        return "", text
    end = text.find("\n---\n", 4)
    if end == -1:
        return "", text
    return text[4:end], text[end + 5 :]


def _infer_wiki_type_from_path(rel_path: str, fallback: str = "unknown") -> str:
    parts = Path(rel_path.replace("\\", "/")).parts
    if len(parts) >= 2 and parts[0] == "wiki":
        return _WIKI_DIR_TYPE.get(parts[1], fallback)
    return fallback


def wiki_file_for_node_id(root: Path, node_id: str) -> Path | None:
    """按 node_id 查找 wiki 页文件（大小写不敏感）。"""
    direct = root / f"{node_id}.md"
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


def meta_from_wiki_path(path: Path, root: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    fm, _ = _parse_wiki_frontmatter(text)
    ptype = "meta"
    title = path.stem
    if m := _FRONTMATTER_TYPE_RE.search(fm):
        ptype = m.group(1)
    if m := _FRONTMATTER_TITLE_RE.search(fm):
        title = m.group(1).strip().strip('"').strip("'")
    rel = path.relative_to(root).as_posix()
    node_id = rel[:-3] if rel.endswith(".md") else rel
    if ptype in ("meta", "unknown"):
        ptype = _infer_wiki_type_from_path(rel, ptype)
    return {
        "id": node_id,
        "title": title,
        "type": ptype,
        "path": rel,
        "file_exists": True,
        "orphan": False,
    }


def _enrich_wiki_nodes_from_disk(root: Path, nodes: dict[str, dict]) -> None:
    wiki_dir = root / "wiki"
    if not wiki_dir.is_dir():
        return
    for path in sorted(wiki_dir.rglob("*.md")):
        from app.services.wiki_index import is_protected_index_name

        if is_protected_index_name(path.name):
            continue
        meta = meta_from_wiki_path(path, root)
        nodes[meta["id"]] = {**nodes.get(meta["id"], {}), **meta}

    for nid, node in list(nodes.items()):
        if not str(nid).startswith("wiki/"):
            continue
        found = wiki_file_for_node_id(root, nid)
        if found:
            disk_meta = meta_from_wiki_path(found, root)
            canonical_id = disk_meta["id"]
            merged = {**node, **disk_meta, "file_exists": True, "orphan": False}
            if canonical_id != nid:
                nodes.pop(nid, None)
                nodes[canonical_id] = {**nodes.get(canonical_id, {}), **merged}
            else:
                nodes[nid] = merged
        else:
            node["file_exists"] = False
            node["orphan"] = True
            if node.get("type") in (None, "unknown"):
                node["type"] = _infer_wiki_type_from_path(
                    node.get("path") or f"{nid}.md", "unknown"
                )


def list_orphan_wiki_nodes(settings: Settings | None = None) -> list[dict]:
    root = wiki_root(settings)
    graph = load_graph(settings)
    orphans: list[dict] = []
    for node in graph.get("nodes", []):
        nid = node.get("id", "")
        if not nid.startswith("wiki/") or nid in ("wiki/index", "wiki/log"):
            continue
        if wiki_file_for_node_id(root, nid):
            continue
        orphans.append(node)
    return orphans


def _slugify(name: str) -> str:
    stem = Path(name).stem
    if stem.endswith(".extract"):
        stem = Path(stem).stem
    s = re.sub(r"[^\w\u4e00-\u9fff\-]+", "-", stem, flags=re.UNICODE)
    s = re.sub(r"-+", "-", s).strip("-").lower()
    return (s[:80] or "source")


def _is_listable_raw(path: Path) -> bool:
    if not path.is_file() or path.name.startswith("."):
        return False
    if path.name.lower() in _SKIP_RAW_NAMES:
        return False
    if path.name.endswith(".extract.md"):
        return False
    return path.suffix.lower() in ALLOWED_RAW_SUFFIXES


def list_raw_files(settings: Settings | None = None) -> list[dict]:
    root = wiki_root(settings)
    raw_dir = root / "raw"
    if not raw_dir.is_dir():
        return []
    items: list[dict] = []
    for path in sorted(raw_dir.rglob("*")):
        if not _is_listable_raw(path):
            continue
        rel = path.relative_to(root).as_posix()
        if rel.startswith("raw/09-archive/") or rel.startswith("raw/archive/"):
            continue
        suffix = path.suffix.lower()
        sidecar = root / extract_sidecar_rel(rel)
        kind = "text"
        if suffix == ".pdf":
            kind = "pdf"
        elif suffix == ".docx":
            kind = "word"
        elif suffix in (".xlsx", ".xlsm", ".xls"):
            kind = "excel"
        from app.services import wiki_ingest

        items.append(
            {
                "path": rel,
                "name": path.name,
                "size": path.stat().st_size,
                "suffix": suffix,
                "kind": kind,
                "extracted": sidecar.is_file(),
                "ingested": wiki_ingest.is_raw_ingested(root, rel),
            }
        )
    return items


async def save_raw_upload(
    file: UploadFile,
    subdir: str = "uploads",
    settings: Settings | None = None,
) -> dict:
    root = wiki_root(settings)
    _ensure_layout(root)

    if not file.filename:
        raise HTTPException(400, "缺少文件名")

    suffix = Path(file.filename).suffix.lower()
    if not is_allowed_suffix(suffix):
        allowed = ", ".join(sorted(ALLOWED_RAW_SUFFIXES))
        raise HTTPException(400, f"不支持的文件类型。允许：{allowed}")

    sub = _safe_relative_path(subdir)
    parts = list(sub.parts)
    if parts and parts[0] == "raw":
        parts = parts[1:]
    target_dir = root / "raw" / (Path(*parts) if parts else Path("uploads"))
    target_dir.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r"[^\w\u4e00-\u9fff.\-]+", "_", Path(file.filename).name)
    target = target_dir / safe_name
    if target.exists():
        stem = target.stem
        target = target_dir / f"{stem}-{date.today().strftime('%Y%m%d')}{suffix}"
        n = 1
        while target.exists():
            target = target_dir / f"{stem}-{n}{suffix}"
            n += 1

    content = await file.read()
    extraction_note = ""
    extract_rel: str | None = None

    if suffix in EXTRACTABLE_SUFFIXES:
        target.write_bytes(content)
        text, extraction_note = extract_text(file.filename, content)
        if text:
            text = normalize_text_content(
                f"{target.stem}.extract.md", text[:500_000]
            )
            sidecar = target.parent / f"{target.stem}.extract.md"
            header = (
                f"---\n"
                f"source_raw: {target.name}\n"
                f"extracted_from: {suffix}\n"
                f"---\n\n"
            )
            sidecar.write_text(header + text, encoding="utf-8")
            extract_rel = sidecar.relative_to(root).as_posix()
    else:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(400, "文本类文件须为 UTF-8 编码") from exc
        text = normalize_text_content(file.filename, text)
        target.write_text(text, encoding="utf-8")
        extraction_note = "utf-8 文本"

    rel = target.relative_to(root).as_posix()
    stub = _ensure_source_stub(
        root,
        rel,
        Path(file.filename).stem,
        extraction_note=extraction_note,
        extract_rel=extract_rel,
    )
    rebuild_graph(settings)
    graph = load_graph(settings)

    return {
        "ok": True,
        "path": rel,
        "extract_path": extract_rel,
        "extraction_note": extraction_note,
        "source_page": stub,
        "graph": {"nodes": len(graph.get("nodes", [])), "edges": len(graph.get("edges", []))},
    }


def delete_raw_file(rel_path: str, settings: Settings | None = None) -> None:
    root = wiki_root(settings)
    rel = _safe_relative_path(rel_path)
    full = (root / rel).resolve()
    raw_root = (root / "raw").resolve()
    if not full.is_file() or not str(full).startswith(str(raw_root)):
        raise HTTPException(404, "文件不存在或不在 raw/ 下")

    full.unlink()
    sidecar = root / extract_sidecar_rel(rel)
    if sidecar.is_file():
        sidecar.unlink()

    slug = _slugify(Path(rel).name)
    wiki_source = root / "wiki" / "sources" / f"{slug}.md"
    if wiki_source.is_file():
        wiki_source.unlink()


def _resolve_node_path(node_id: str, settings: Settings | None = None) -> Path:
    root = wiki_root(settings)
    rel = _safe_relative_path(node_id)
    candidate = root / rel

    if rel.parts and rel.parts[0] == "wiki" and candidate.suffix == "":
        candidate = candidate.with_suffix(".md")

    full = candidate.resolve()
    if not str(full).startswith(str(root.resolve())):
        raise HTTPException(400, "非法路径")
    if not full.is_file():
        raise HTTPException(404, "节点文件不存在")
    return full


def read_node_content(node_id: str, settings: Settings | None = None) -> dict:
    root = wiki_root(settings)
    path = _resolve_node_path(node_id, settings)
    rel = path.relative_to(root).as_posix()
    suffix = path.suffix.lower()
    title = path.stem

    if rel.startswith("raw/") and suffix in EXTRACTABLE_SUFFIXES:
        sidecar = root / extract_sidecar_rel(rel)
        if sidecar.is_file():
            body = sidecar.read_text(encoding="utf-8", errors="replace")
            body = normalize_markdown_images(body, rel, settings)
            return {
                "id": node_id,
                "path": rel,
                "title": title,
                "content": body,
                "source": "extract",
                "note": f"二进制原件已保留，当前展示自动提取文本：{sidecar.relative_to(root).as_posix()}",
            }
        return {
            "id": node_id,
            "path": rel,
            "title": title,
            "content": "",
            "source": "binary",
            "note": "该 raw 是二进制文件，尚未生成可预览的文本提取内容。",
        }

    if rel.startswith("raw/") and suffix not in _TEXT_PREVIEW_SUFFIXES:
        return {
            "id": node_id,
            "path": rel,
            "title": title,
            "content": "",
            "source": "unsupported",
            "note": "该文件类型暂不支持网页预览。",
        }

    body = path.read_text(encoding="utf-8", errors="replace")
    body = normalize_markdown_images(body, rel, settings)
    return {
        "id": node_id,
        "path": rel,
        "title": title,
        "content": body,
        "source": "file",
        "note": "",
    }


def _ensure_source_stub(
    root: Path,
    raw_rel: str,
    title: str,
    *,
    extraction_note: str = "",
    extract_rel: str | None = None,
) -> str:
    slug = _slugify(Path(raw_rel).name)
    wiki_path = root / "wiki" / "sources" / f"{slug}.md"
    today = date.today().isoformat()
    extract_line = ""
    if extract_rel:
        extract_line = f"\n- 文本提取：`{extract_rel}`（{extraction_note}）"
    elif extraction_note:
        extract_line = f"\n- 提取说明：{extraction_note}"

    body = f"""---
title: {title}
type: source
aliases: []
tags: [uploaded]
sources:
  - {raw_rel}
created: {today}
updated: {today}
status: draft
source_count: 1
---

# {title}

> 来源：`{raw_rel}`（网页上传；待 Agent 完整 ingest）{extract_line}

## 一句话

（待补充）

## 要点

- 原始文件已入库 `raw/`。

## 相关

- 原始层：`{raw_rel}`

## 开放问题

- [ ] 是否已由 LLM 完成结构化摘要与概念链接？
"""
    wiki_path.parent.mkdir(parents=True, exist_ok=True)
    wiki_path.write_text(body, encoding="utf-8")
    return wiki_path.relative_to(root).as_posix()


def rebuild_graph(settings: Settings | None = None) -> dict:
    from app.services.wiki_index import rebuild_wiki_index

    root = wiki_root(settings)
    rebuild_wiki_index(root)
    script = root / "scripts" / "build_graph.py"
    if not script.is_file():
        raise HTTPException(500, f"缺少图谱脚本: {script}")

    proc = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(root.parent),
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        raise HTTPException(500, f"图谱构建失败: {proc.stderr or proc.stdout}")

    graph = load_graph(settings)
    return {
        "ok": True,
        "nodes": len(graph.get("nodes", [])),
        "edges": len(graph.get("edges", [])),
        "message": proc.stdout.strip(),
    }


def _parse_sources_from_frontmatter(text: str) -> list[str]:
    m = _SOURCES_RE.search(text)
    if not m:
        return []
    paths: list[str] = []
    for line in m.group(1).splitlines():
        line = line.strip()
        if line.startswith("- "):
            paths.append(line[2:].strip().strip('"').strip("'"))
    return paths


def _add_raw_node(nodes: dict[str, dict], root: Path, path: Path) -> None:
    if not _is_listable_raw(path):
        return
    nid = path.relative_to(root).as_posix()
    if nid not in nodes:
        nodes[nid] = {
            "id": nid,
            "title": path.stem,
            "type": "raw",
            "path": nid,
            "kind": path.suffix.lower().lstrip("."),
        }


def load_graph(settings: Settings | None = None) -> dict:
    root = wiki_root(settings)
    graph_file = root / "graph" / "links.json"
    base: dict = {
        "version": 1,
        "generated_at": None,
        "nodes": [],
        "edges": [],
    }
    if graph_file.is_file():
        try:
            base = json.loads(graph_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass

    nodes: dict[str, dict] = {n["id"]: dict(n) for n in base.get("nodes", [])}
    edges: list[dict] = list(base.get("edges", []))
    seen_edges: set[tuple[str, str, str]] = {
        (e["source"], e["target"], e.get("type", "wikilink")) for e in edges
    }

    raw_dir = root / "raw"
    if raw_dir.is_dir():
        for path in sorted(raw_dir.rglob("*")):
            _add_raw_node(nodes, root, path)
            if path.suffix.lower() in EXTRACTABLE_SUFFIXES:
                sidecar = path.parent / f"{path.stem}.extract.md"
                if sidecar.is_file():
                    sid = sidecar.relative_to(root).as_posix()
                    nodes[sid] = {
                        "id": sid,
                        "title": f"{path.stem} (提取)",
                        "type": "raw_extract",
                        "path": sid,
                    }
                    pair = (sid, path.relative_to(root).as_posix(), "extract_of")
                    if pair not in seen_edges:
                        seen_edges.add(pair)
                        edges.append(
                            {
                                "source": sid,
                                "target": path.relative_to(root).as_posix(),
                                "type": "extract_of",
                            }
                        )

    wiki_dir = root / "wiki"
    if wiki_dir.is_dir():
        for path in sorted(wiki_dir.rglob("*.md")):
            if path.name == "log.md" or (
                path.name.startswith("index-") and path.name.endswith(".md")
            ):
                continue
            text = path.read_text(encoding="utf-8")
            wiki_id = path.relative_to(root).as_posix()
            if wiki_id.endswith(".md"):
                wiki_id = wiki_id[:-3]

            for raw_ref in _parse_sources_from_frontmatter(text):
                raw_id = raw_ref if raw_ref.startswith("raw/") else f"raw/{raw_ref}"
                raw_full = root / raw_id
                if raw_full.is_file():
                    _add_raw_node(nodes, root, raw_full)
                pair = (wiki_id, raw_id, "derived_from")
                if raw_full.is_file() and pair not in seen_edges:
                    seen_edges.add(pair)
                    edges.append(
                        {"source": wiki_id, "target": raw_id, "type": "derived_from"}
                    )

    _enrich_wiki_nodes_from_disk(root, nodes)

    return {
        **base,
        "nodes": sorted(nodes.values(), key=lambda n: n["id"]),
        "edges": edges,
    }


def wiki_status(settings: Settings | None = None) -> dict:
    root = wiki_root(settings)
    graph = load_graph(settings)
    return {
        "ok": root.is_dir(),
        "wiki_root": str(root),
        "raw_count": len(list_raw_files(settings)),
        "nodes": len(graph.get("nodes", [])),
        "edges": len(graph.get("edges", [])),
        "allowed_suffixes": sorted(ALLOWED_RAW_SUFFIXES),
    }
