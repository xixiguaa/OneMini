"""文本嵌入：默认 BAAI/bge-m3（fastembed ONNX）；其它模型名同样走 fastembed。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import Settings, get_settings

# 已知维度，避免健康检查加载大模型
_KNOWN_DIMS: dict[str, int] = {
    "baai/bge-m3": 1024,
    "baai/bge-small-zh-v1.5": 512,
    "baai/bge-base-zh-v1.5": 768,
    "baai/bge-large-zh-v1.5": 1024,
}

_bge_m3_registered = False
_fastembed: Any | None = None
_active_model: str | None = None


def _model_key(name: str) -> str:
    return (name or "").strip()


def is_bge_m3_model(model_name: str) -> bool:
    n = _model_key(model_name).lower()
    return n in ("bge-m3", "baai/bge-m3") or "bge-m3" in n


def _resolve_model_name(settings: Settings) -> str:
    name = _model_key(settings.embedding_model)
    if is_bge_m3_model(name):
        return "BAAI/bge-m3"
    return name or "BAAI/bge-m3"


def _ensure_model_slot(settings: Settings) -> None:
    global _active_model, _fastembed
    resolved = _resolve_model_name(settings)
    if _active_model == resolved:
        return
    _active_model = resolved
    _fastembed = None


def _bge_m3_snapshot_dir() -> Path | None:
    hub = Path.home() / ".cache/huggingface/hub/models--BAAI--bge-m3/snapshots"
    if not hub.is_dir():
        return None
    candidates = [
        p for p in hub.iterdir() if p.is_dir() and (p / "onnx" / "model.onnx").is_file()
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def _register_bge_m3_fastembed() -> None:
    global _bge_m3_registered
    if _bge_m3_registered:
        return
    from fastembed import TextEmbedding
    from fastembed.common.model_description import ModelSource, PoolingType

    known = {m.model.lower() for m in TextEmbedding._list_supported_models()}
    if "baai/bge-m3" not in known:
        TextEmbedding.add_custom_model(
            model="BAAI/bge-m3",
            pooling=PoolingType.CLS,
            normalization=True,
            sources=ModelSource(hf="BAAI/bge-m3"),
            dim=1024,
            model_file="onnx/model.onnx",
            additional_files=["onnx/Constant_7_attr__value"],
            description="BGE-M3 dense ONNX (multilingual, 1024d)",
            license="mit",
            size_in_gb=2.27,
        )
    _bge_m3_registered = True


@lru_cache
def get_embedding_dim() -> int:
    settings = get_settings()
    resolved = _resolve_model_name(settings)
    known = _KNOWN_DIMS.get(resolved.lower())
    if known is not None:
        return known
    sample = embed_texts(["维度探测"])
    if not sample:
        raise RuntimeError("嵌入模型未返回向量")
    return len(sample[0])


def _get_fastembed():
    global _fastembed
    from fastembed import TextEmbedding

    settings = get_settings()
    _ensure_model_slot(settings)
    resolved = _resolve_model_name(settings)
    if _fastembed is None:
        kwargs: dict[str, Any] = {}
        if is_bge_m3_model(resolved):
            _register_bge_m3_fastembed()
            snap = _bge_m3_snapshot_dir()
            if snap is not None:
                kwargs["specific_model_path"] = str(snap)
        _fastembed = TextEmbedding(model_name=resolved, **kwargs)
    return _fastembed


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    settings = get_settings()
    _ensure_model_slot(settings)
    model = _get_fastembed()
    return [vec.tolist() for vec in model.embed(texts)]


def ping_embedding(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    resolved = _resolve_model_name(settings)
    return {
        "model": settings.embedding_model,
        "resolved": resolved,
        "backend": "fastembed-onnx",
        "dim": _KNOWN_DIMS.get(resolved.lower()) or "probe_on_use",
        "max_length": settings.embedding_max_length if is_bge_m3_model(settings.embedding_model) else None,
    }
