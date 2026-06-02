#!/usr/bin/env python3
"""
将目录下的 .md / .txt 批量写入当前 MILVUS_COLLECTION（BGE-M3 嵌入）。

用法:
  python scripts/ingest_knowledge_dir.py data/knowledge_seed
  python scripts/ingest_knowledge_dir.py ../README.md
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.services import rag


def _collect_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path] if path.suffix.lower() in {".md", ".txt"} else []
    if not path.is_dir():
        return []
    files: list[Path] = []
    for pattern in ("**/*.md", "**/*.txt"):
        files.extend(path.glob(pattern))
    return sorted({f.resolve() for f in files})


async def ingest_path(path: Path, *, user_id: str) -> dict:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return {"file": str(path), "skipped": True, "reason": "empty"}
    source = path.name
    result = await rag.ingest_text(text, source, user_id=user_id)
    return {"file": str(path), "ok": True, **result}


async def main_async(paths: list[Path], user_id: str) -> None:
    settings = get_settings()
    print(f"集合: {settings.milvus_collection}  嵌入: {settings.embedding_model}")

    files: list[Path] = []
    for p in paths:
        files.extend(_collect_files(p))
    if not files:
        print("未找到 .md / .txt 文件")
        return

    for f in files:
        try:
            out = await ingest_path(f, user_id=user_id)
            print(out)
        except Exception as exc:
            print({"file": str(f), "ok": False, "error": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description="批量知识库入库")
    parser.add_argument(
        "paths",
        nargs="+",
        help="文件或目录路径",
    )
    parser.add_argument(
        "--user-id",
        default="default",
        help="与 API X-User-Id 一致，默认 default",
    )
    args = parser.parse_args()
    roots = [Path(p).expanduser().resolve() for p in args.paths]
    asyncio.run(main_async(roots, args.user_id))


if __name__ == "__main__":
    main()
