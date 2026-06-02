"""RAG 重排序：默认 Qwen3-Reranker-0.6B（ONNX，qwen3-embed）。"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.config import Settings, get_settings

# 官方 HF 名 → qwen3-embed 预量化 ONNX（与 embedding 一样本地推理，无需 API Key）
_QWEN3_ONNX_ALIASES: dict[str, str] = {
    "Qwen/Qwen3-Reranker-0.6B": "n24q02m/Qwen3-Reranker-0.6B-ONNX",
    "qwen/Qwen3-Reranker-0.6B": "n24q02m/Qwen3-Reranker-0.6B-ONNX",
    "n24q02m/Qwen3-Reranker-0.6B-ONNX": "n24q02m/Qwen3-Reranker-0.6B-ONNX",
    "Qwen/Qwen3-Reranker-0.6B-Q4F16": "n24q02m/Qwen3-Reranker-0.6B-ONNX-Q4F16",
    "n24q02m/Qwen3-Reranker-0.6B-ONNX-Q4F16": "n24q02m/Qwen3-Reranker-0.6B-ONNX-Q4F16",
}

_reranker: Any | None = None


def resolve_rerank_model_id(model_name: str) -> str:
    key = (model_name or "").strip()
    if not key:
        return _QWEN3_ONNX_ALIASES["Qwen/Qwen3-Reranker-0.6B"]
    return _QWEN3_ONNX_ALIASES.get(key, key)


@lru_cache
def _load_reranker(model_id: str) -> Any:
    from qwen3_embed import TextCrossEncoder

    return TextCrossEncoder(model_name=model_id)


def _get_reranker(settings: Settings | None = None) -> Any:
    global _reranker
    settings = settings or get_settings()
    model_id = resolve_rerank_model_id(settings.rerank_model)
    if _reranker is None or getattr(_reranker, "_onemini_model_id", None) != model_id:
        _reranker = _load_reranker(model_id)
        _reranker._onemini_model_id = model_id  # type: ignore[attr-defined]
    return _reranker


def rerank_hits(
    query: str,
    hits: list[dict[str, Any]],
    *,
    top_k: int,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """对向量召回结果按 cross-encoder 精排，保留 top_k。"""
    if not hits:
        return []
    settings = settings or get_settings()
    texts = [str(h.get("text") or "") for h in hits]
    if not any(t.strip() for t in texts):
        return hits[:top_k]

    encoder = _get_reranker(settings)
    scores = list(encoder.rerank(query, texts, batch_size=settings.rerank_batch_size))

    enriched: list[dict[str, Any]] = []
    for hit, rerank_score in zip(hits, scores):
        row = dict(hit)
        row["vector_score"] = hit.get("score")
        row["rerank_score"] = float(rerank_score)
        row["score"] = row["rerank_score"]
        enriched.append(row)

    enriched.sort(key=lambda x: x["rerank_score"], reverse=True)
    return enriched[:top_k]


def ping_rerank(settings: Settings | None = None) -> dict[str, Any]:
    """健康检查：仅报告配置，不强制下载模型。"""
    settings = settings or get_settings()
    return {
        "enabled": settings.rag_rerank_enabled,
        "model": settings.rerank_model,
        "onnx_model": resolve_rerank_model_id(settings.rerank_model),
        "recall_k": settings.rag_recall_k,
        "backend": "qwen3-embed",
    }
