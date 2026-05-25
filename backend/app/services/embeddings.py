from functools import lru_cache

from fastembed import TextEmbedding

from app.config import get_settings

_embedder: TextEmbedding | None = None
_dim: int | None = None


@lru_cache
def get_embedding_dim() -> int:
    model = _get_embedder()
    sample = list(model.embed(["维度探测"]))
    if not sample:
        raise RuntimeError("嵌入模型未返回向量")
    return len(sample[0])


def _get_embedder() -> TextEmbedding:
    global _embedder
    if _embedder is None:
        settings = get_settings()
        _embedder = TextEmbedding(model_name=settings.embedding_model)
    return _embedder


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_embedder()
    return [vec.tolist() for vec in model.embed(texts)]
