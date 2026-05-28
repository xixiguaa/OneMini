"""Wiki / raw Markdown 图片路径解析：优先 figures，找不到则移除引用。"""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import quote

from app.config import Settings, get_settings
from app.services.wiki_paths import wiki_root

_IMAGE_MD_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
_IMAGE_HTML_RE = re.compile(
    r"<img\s+[^>]*\bsrc=(['\"])([^'\"]+)\1[^>]*>",
    re.IGNORECASE,
)
_EXTERNAL_RE = re.compile(r"^(?:https?:|//|data:)", re.IGNORECASE)
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp")


def asset_api_url(root_rel: str) -> str:
    return f"/api/platform/wiki/asset?path={quote(root_rel, safe='')}"


def read_wiki_asset_file(path: str, settings: Settings | None = None) -> Path:
    root = wiki_root(settings or get_settings())
    rel = Path(path.replace("\\", "/").strip().lstrip("/"))
    if ".." in rel.parts:
        raise ValueError("非法路径")
    full = (root / rel).resolve()
    if not full.is_file() or not str(full).startswith(str(root.resolve())):
        raise FileNotFoundError(path)
    return full


def _is_external(ref: str) -> bool:
    return bool(_EXTERNAL_RE.match(ref.strip()))


def _match_name_in_dir(directory: Path, name: str) -> Path | None:
    if not directory.is_dir() or not name:
        return None
    direct = directory / name
    if direct.is_file():
        return direct
    lower = name.lower()
    for entry in directory.iterdir():
        if entry.is_file() and entry.name.lower() == lower:
            return entry
    stem = Path(name).stem
    if stem and not Path(name).suffix:
        stem_lower = stem.lower()
        for entry in directory.iterdir():
            if not entry.is_file():
                continue
            if entry.stem.lower() == stem_lower:
                return entry
            for ext in _IMAGE_EXTS:
                if entry.name.lower() == stem_lower + ext:
                    return entry
    return None


def _linked_raw_parent_dirs(root: Path, doc_rel: str) -> list[Path]:
    """wiki 页 frontmatter 中 sources 指向的 raw 目录（用于 figures 回退）。"""
    doc_path = root / doc_rel.replace("\\", "/")
    if not doc_path.is_file() or doc_rel.startswith("raw/"):
        return []
    try:
        text = doc_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    dirs: list[Path] = []
    for m in re.finditer(r"^\s+-\s+(raw/[^\n#]+)\s*$", text, re.MULTILINE):
        raw_rel = m.group(1).strip()
        raw_path = root / raw_rel
        if raw_path.is_file():
            dirs.append(raw_path.parent)
            continue
        md_path = raw_path if raw_rel.endswith(".md") else raw_path.with_suffix(".md")
        if md_path.is_file():
            dirs.append(md_path.parent)
    return dirs


def resolve_asset_file(root: Path, doc_rel: str, ref: str) -> Path | None:
    """按文档位置解析本地图片；依次尝试相对路径、figures/ 文件名、raw/assets。"""
    ref = ref.strip().strip("<>").split("?")[0].split("#")[0]
    if not ref or _is_external(ref):
        return None

    doc_path = (root / doc_rel.replace("\\", "/")).resolve()
    if not doc_path.is_file():
        doc_dir = doc_path.parent
    else:
        doc_dir = doc_path.parent

    root = root.resolve()
    name = Path(ref.replace("\\", "/")).name
    candidates: list[Path] = []

    ref_path = Path(ref.replace("\\", "/"))
    if ref_path.is_absolute():
        candidates.append(ref_path)
    else:
        candidates.append((doc_dir / ref_path).resolve())

    if name:
        candidates.append((doc_dir / "figures" / name).resolve())
        if ref_path.name != name:
            candidates.append((doc_dir / "figures" / ref_path.name).resolve())
        candidates.append((root / "raw" / "assets" / name).resolve())
        stem = Path(name).stem
        if stem and not Path(name).suffix:
            for ext in _IMAGE_EXTS:
                candidates.append((doc_dir / "figures" / (stem + ext)).resolve())

    search_dirs: list[Path] = [doc_dir / "figures", root / "raw" / "assets"]
    search_dirs.extend(_linked_raw_parent_dirs(root, doc_rel))
    for directory in search_dirs:
        matched = _match_name_in_dir(directory, name or ref_path.name)
        if matched:
            candidates.append(matched.resolve())

    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        try:
            if candidate.is_file() and str(candidate).startswith(str(root)):
                return candidate
        except OSError:
            continue
    return None


def normalize_markdown_images(
    content: str,
    doc_rel: str,
    settings: Settings | None = None,
) -> str:
    """将可解析的本地图片改为 API URL；找不到的 markdown/html 图片引用直接删除。"""
    if not content or "![" not in content and "<img" not in content.lower():
        return content

    root = wiki_root(settings or get_settings())

    def md_repl(match: re.Match[str]) -> str:
        alt, ref = match.group(1), match.group(2).strip()
        if _is_external(ref):
            return match.group(0)
        found = resolve_asset_file(root, doc_rel, ref)
        if not found:
            return ""
        rel = found.relative_to(root).as_posix()
        return f"![{alt}]({asset_api_url(rel)})"

    def html_repl(match: re.Match[str]) -> str:
        full, ref = match.group(0), match.group(2).strip()
        if _is_external(ref):
            return full
        found = resolve_asset_file(root, doc_rel, ref)
        if not found:
            return ""
        rel = found.relative_to(root).as_posix()
        return re.sub(
            r"\bsrc=(['\"])([^'\"]+)\1",
            f'src="{asset_api_url(rel)}"',
            full,
            count=1,
            flags=re.IGNORECASE,
        )

    out = _IMAGE_HTML_RE.sub(html_repl, content)
    out = _IMAGE_MD_RE.sub(md_repl, out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out
