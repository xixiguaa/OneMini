"""raw 归档：ingest 成功后移至 raw/09-archive/YYYY-MM/（架构 L1.5）。"""

from __future__ import annotations

import re
import shutil
from datetime import date
from pathlib import Path

# 新路径（架构图）；兼容旧路径 raw/archive/
_ARCHIVE_PREFIXES = ("raw/09-archive/", "raw/archive/")


def is_under_archive(raw_rel: str) -> bool:
    norm = raw_rel.replace("\\", "/")
    return any(norm.startswith(p) for p in _ARCHIVE_PREFIXES)


def _archive_roots(root: Path) -> list[Path]:
    return [
        root / "raw" / "09-archive",
        root / "raw" / "archive",
    ]


def find_archived_duplicate(root: Path, raw_rel: str) -> str | None:
    """按文件名在 09-archive（及旧 archive）中查找是否已处理过。"""
    name = Path(raw_rel).name
    for archive_root in _archive_roots(root):
        if not archive_root.is_dir():
            continue
        for path in archive_root.rglob(name):
            if path.is_file() and path.name == name:
                return path.relative_to(root).as_posix()
    return None


def _append_archived_frontmatter(text: str, archived_date: str) -> str:
    if not text.startswith("---\n"):
        return f"---\narchived: {archived_date}\n---\n\n{text}"
    end = text.find("\n---\n", 4)
    if end == -1:
        return text
    fm = text[4:end]
    if re.search(r"^archived:\s*", fm, re.MULTILINE):
        fm = re.sub(
            r"^archived:\s*.+$",
            f"archived: {archived_date}",
            fm,
            count=1,
            flags=re.MULTILINE,
        )
    else:
        fm = fm.rstrip() + f"\narchived: {archived_date}"
    return f"---\n{fm}\n---\n{text[end + 5 :]}"


def archive_raw_file(root: Path, raw_rel: str) -> str:
    """
    将已 ingest 的 raw 移至 raw/09-archive/YYYY-MM/，保留 raw 下相对子路径。
    返回新相对路径。
    """
    raw_rel = raw_rel.replace("\\", "/").strip().lstrip("/")
    if is_under_archive(raw_rel):
        return raw_rel

    src = root / raw_rel
    if not src.is_file():
        raise FileNotFoundError(raw_rel)

    month = date.today().strftime("%Y-%m")
    archived_date = date.today().isoformat()

    try:
        rel_under_raw = Path(raw_rel).relative_to("raw")
        # 若已在 09-archive 或 archive 子路径下则只取文件名层
        if rel_under_raw.parts and rel_under_raw.parts[0] in ("09-archive", "archive"):
            rel_under_raw = Path(*rel_under_raw.parts[1:])
    except ValueError:
        rel_under_raw = Path(src.name)

    dest = root / "raw" / "09-archive" / month / rel_under_raw
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        n = 1
        while dest.exists():
            dest = dest.parent / f"{stem}-{n}{suffix}"
            n += 1

    if src.suffix.lower() in (".md", ".markdown", ".txt"):
        text = src.read_text(encoding="utf-8", errors="replace")
        dest.write_text(_append_archived_frontmatter(text, archived_date), encoding="utf-8")
        src.unlink()
    else:
        shutil.move(str(src), str(dest))

    return dest.relative_to(root).as_posix()
