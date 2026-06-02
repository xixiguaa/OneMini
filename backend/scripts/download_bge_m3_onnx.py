#!/usr/bin/env python3
"""下载 BGE-M3 ONNX 权重（fastembed 嵌入所需）。"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

REPO = "BAAI/bge-m3"
REPO_CACHE = "models--BAAI--bge-m3"
# 大文件优先；model.onnx_data 约 2.1GB
FILES = [
    "onnx/model.onnx_data",
    "onnx/model.onnx",
    "onnx/Constant_7_attr__value",
    "onnx/config.json",
    "onnx/tokenizer.json",
    "onnx/tokenizer_config.json",
    "onnx/special_tokens_map.json",
    "onnx/sentencepiece.bpe.model",
]
MAX_ATTEMPTS = 8
LARGE_FILE = "onnx/model.onnx_data"


def _hub_endpoint() -> str:
    return os.environ.get("HF_ENDPOINT", "https://hf-mirror.com").rstrip("/")


def _hub_cache_root() -> Path:
    return Path.home() / ".cache/huggingface/hub" / REPO_CACHE


def _fetch_json(url: str) -> object:
    curl = shutil.which("curl")
    if not curl:
        raise RuntimeError("未找到 curl")
    proc = subprocess.run(
        [curl, "-fsSL", url],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout)


def _file_metadata(path: str) -> tuple[str, int]:
    """返回 (blob_hash, size_bytes)。"""
    endpoint = _hub_endpoint()
    url = f"{endpoint}/api/models/{REPO}/tree/main/{Path(path).parent.as_posix()}"
    entries = _fetch_json(url)
    if not isinstance(entries, list):
        raise RuntimeError(f"无法解析模型文件列表: {url}")
    for item in entries:
        if isinstance(item, dict) and item.get("path") == path:
            lfs = item.get("lfs") or {}
            blob_hash = lfs.get("oid") or item.get("oid")
            size = int(lfs.get("size") or item.get("size") or 0)
            if not blob_hash or size <= 0:
                break
            return str(blob_hash), size
    raise RuntimeError(f"未在仓库中找到文件: {path}")


def _snapshot_dirs() -> list[Path]:
    root = _hub_cache_root() / "snapshots"
    if not root.is_dir():
        return []
    return sorted(
        [p for p in root.iterdir() if p.is_dir()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )


def _resolve_snapshot_dir() -> Path:
    from app.services.embeddings import _bge_m3_snapshot_dir

    snap = _bge_m3_snapshot_dir()
    if snap is not None:
        return snap
    snaps = _snapshot_dirs()
    if snaps:
        return snaps[0]
    endpoint = _hub_endpoint()
    info = _fetch_json(f"{endpoint}/api/models/{REPO}")
    if not isinstance(info, dict):
        raise RuntimeError("无法获取 BGE-M3 模型 revision")
    sha = str(info.get("sha") or "").strip()
    if not sha:
        raise RuntimeError("无法获取 BGE-M3 模型 revision")
    snap = _hub_cache_root() / "snapshots" / sha
    snap.mkdir(parents=True, exist_ok=True)
    return snap


def _blob_symlink(snapshot: Path, relpath: str, blob_hash: str) -> Path:
    dest = snapshot / relpath
    if dest.is_file() or dest.is_symlink():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    rel = Path("../" * (len(Path(relpath).parts) + 1)) / "blobs" / blob_hash
    dest.symlink_to(rel)
    return dest


def _blob_ready(blob_path: Path, expected_size: int) -> bool:
    return blob_path.is_file() and blob_path.stat().st_size == expected_size


def _download_blob_with_curl(url: str, blob_path: Path, expected_size: int) -> None:
    blob_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = blob_path.with_suffix(blob_path.suffix + ".incomplete")
    if tmp.is_file() and tmp.stat().st_size > expected_size:
        tmp.unlink()

    curl = shutil.which("curl")
    if not curl:
        raise RuntimeError("未找到 curl，请先安装 curl 或使用可访问 huggingface 的网络")

    cmd = [
        curl,
        "-fL",
        "--retry",
        "8",
        "--retry-delay",
        "5",
        "--retry-all-errors",
        "-C",
        "-",
        "-o",
        str(tmp),
        url,
    ]
    last_err: BaseException | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            subprocess.run(cmd, check=True)
            if tmp.stat().st_size != expected_size:
                raise RuntimeError(
                    f"下载大小不匹配: 期望 {expected_size}，实际 {tmp.stat().st_size}"
                )
            tmp.replace(blob_path)
            return
        except BaseException as err:
            last_err = err
            if attempt >= MAX_ATTEMPTS:
                break
            wait = min(60, 2**attempt)
            print(
                f"  ! curl 下载失败 ({err!r})，{wait}s 后重试 "
                f"[{attempt}/{MAX_ATTEMPTS}]",
                flush=True,
            )
            time.sleep(wait)
    assert last_err is not None
    raise last_err


def _download_via_hub(name: str) -> Path:
    from huggingface_hub import hf_hub_download
    from huggingface_hub.utils import close_session

    last_err: BaseException | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        close_session()
        try:
            path = hf_hub_download(REPO, name)
            return Path(path)
        except BaseException as err:
            last_err = err
            close_session()
            if attempt >= MAX_ATTEMPTS:
                break
            wait = min(60, 2**attempt)
            print(
                f"  ! {name} hub 下载失败 ({err!r})，{wait}s 后重试 "
                f"[{attempt}/{MAX_ATTEMPTS}]",
                flush=True,
            )
            time.sleep(wait)
    assert last_err is not None
    raise last_err


def _download_file(name: str, snapshot: Path) -> Path:
    linked = snapshot / name
    if linked.is_file():
        return linked

    blob_hash, size = _file_metadata(name)
    blob_path = _hub_cache_root() / "blobs" / blob_hash
    if _blob_ready(blob_path, size):
        return _blob_symlink(snapshot, name, blob_hash)

    endpoint = _hub_endpoint()
    url = f"{endpoint}/{REPO}/resolve/main/{name}"
    print(f"  ↓ {name} ({size / (1024 ** 3):.2f} GB) via curl …", flush=True)
    _download_blob_with_curl(url, blob_path, size)
    return _blob_symlink(snapshot, name, blob_hash)


def main() -> None:
    from app.services.embeddings import _bge_m3_snapshot_dir

    endpoint = _hub_endpoint()
    print(f"HF_ENDPOINT={endpoint}")

    snap = _bge_m3_snapshot_dir()
    if snap and (snap / "onnx" / "model.onnx_data").is_file():
        print(f"已存在完整 ONNX 缓存: {snap}")
        return

    print("正在下载 BAAI/bge-m3 ONNX 文件…")
    snapshot = _resolve_snapshot_dir()

    for name in FILES:
        try:
            if name == LARGE_FILE:
                path = _download_file(name, snapshot)
            else:
                try:
                    path = _download_via_hub(name)
                except BaseException as hub_err:
                    print(f"  ! hub 下载 {name} 失败，改用 curl: {hub_err!r}", flush=True)
                    path = _download_file(name, snapshot)
            print(f"  ✓ {name} -> {path}")
        except (subprocess.CalledProcessError, OSError, RuntimeError) as err:
            raise SystemExit(
                f"下载 {name} 失败: {err}\n"
                "可尝试切换镜像，例如:\n"
                "  export HF_ENDPOINT=https://hf-mirror.com\n"
                "  export HF_ENDPOINT=https://huggingface.co"
            ) from err

    snap = _bge_m3_snapshot_dir()
    if not snap or not (snap / "onnx" / "model.onnx_data").is_file():
        raise SystemExit(
            "model.onnx_data 仍未就绪。请检查网络后重试:\n"
            "  bash scripts/setup_bgem3_collections.sh"
        )
    print(f"OK: {snap}")


if __name__ == "__main__":
    main()
