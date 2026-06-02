import time

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.context import bind_user_context
from app.deps import get_current_user
from app.services.embeddings import get_embedding_dim, ping_embedding
from app.services.rerank import ping_rerank
from app.db.session import ping_postgres
from app.services.chat_store import get_storage_info
from app.services import llm_wiki
from app.services.milvus_store import ping_milvus
from app.services.minio_storage import ping_minio

router = APIRouter(tags=["health"])

_health_cache: dict[str, tuple[float, dict]] = {}
_HEALTH_CACHE_SEC = 5.0


@router.get("/health/live")
def health_live():
    """轻量探活，供压测/负载均衡高频探测（不访问 Milvus）。"""
    return {"ok": True, "service": "onemini-platform"}


@router.get("/health")
def health(user_id: str = Depends(get_current_user)):
    bind_user_context(user_id)
    now = time.time()
    cached = _health_cache.get(user_id)
    if cached and now - cached[0] < _HEALTH_CACHE_SEC:
        return cached[1]

    settings = get_settings()
    milvus = ping_milvus(settings)
    langchain_ok = False
    langchain_error: str | None = None
    if milvus.get("ok"):
        try:
            from app.services.langchain_store import get_vector_store

            get_vector_store(settings)
            langchain_ok = True
        except Exception as exc:
            langchain_error = str(exc)
    else:
        langchain_error = "Milvus 未连接"

    payload = {
        "ok": True,
        "service": "onemini-platform",
        "postgres": ping_postgres(settings),
        "minio": ping_minio(settings),
        "milvus": milvus,
        "langchain": {
            "ok": langchain_ok,
            "milvus_integration": "langchain-milvus",
            "error": langchain_error,
        },
        "embedding": ping_embedding(settings),
        "embedding_dim": get_embedding_dim() if milvus.get("ok") else None,
        "rerank": ping_rerank(settings),
        "llm_configured": bool(settings.openai_api_key),
        "chat_model": settings.chat_model,
        "collection": settings.milvus_collection,
        "chat_collection": settings.milvus_chat_collection,
        "chat_storage": get_storage_info(),
        "llm_wiki": llm_wiki.wiki_status(user_id=user_id),
    }
    _health_cache[user_id] = (now, payload)
    return payload
