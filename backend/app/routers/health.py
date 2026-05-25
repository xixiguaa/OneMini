from fastapi import APIRouter

from app.config import get_settings
from app.services.embeddings import get_embedding_dim
from app.services.milvus_store import ping_milvus

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    settings = get_settings()
    milvus = ping_milvus(settings)
    return {
        "ok": True,
        "service": "onemini-platform",
        "milvus": milvus,
        "embedding_model": settings.embedding_model,
        "embedding_dim": get_embedding_dim() if milvus.get("ok") else None,
        "llm_configured": bool(settings.openai_api_key),
        "chat_model": settings.chat_model,
        "collection": settings.milvus_collection,
    }
