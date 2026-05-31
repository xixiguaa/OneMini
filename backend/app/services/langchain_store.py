"""
LangChain + Milvus 向量库（langchain-milvus 官方集成）。

对接现有 onemini_knowledge 集合字段：id / text / embedding / doc_id / chunk_index / source / created_at
"""

from __future__ import annotations

import time
from typing import Any

from langchain_milvus import Milvus
from pymilvus import connections

from app.config import Settings, get_settings
from app.services.langchain_embeddings import FastEmbedEmbeddings

_vector_store: Milvus | None = None
_patched = False


def _milvus_uri(settings: Settings) -> str:
    return f"http://{settings.milvus_host}:{settings.milvus_port}"


def _ensure_langchain_milvus_patch() -> None:
    """langchain-milvus 使用 MilvusClient，但内部仍依赖 ORM Collection，需桥接 ORM 连接。"""
    global _patched
    if _patched:
        return

    from langchain_milvus.vectorstores import milvus as lm

    orig_init = lm.Milvus._init

    def patched_init(self, *args, **kwargs):
        conn = self._connection_args
        uri = conn.get("uri")
        if not uri:
            host = conn.get("host", "127.0.0.1")
            port = conn.get("port", "19530")
            uri = f"http://{host}:{port}"
        alias = self.alias
        if alias and not connections.has_connection(alias):
            connections.connect(alias=alias, uri=uri)
        return orig_init(self, *args, **kwargs)

    lm.Milvus._init = patched_init
    _patched = True


def reset_vector_store() -> None:
    global _vector_store
    _vector_store = None


def get_vector_store(settings: Settings | None = None) -> Milvus:
    """获取 LangChain Milvus 向量库（连接既有集合，不 drop）。"""
    global _vector_store
    settings = settings or get_settings()
    if _vector_store is not None:
        return _vector_store

    _ensure_langchain_milvus_patch()

    _vector_store = Milvus(
        embedding_function=FastEmbedEmbeddings(),
        collection_name=settings.milvus_collection,
        connection_args={"uri": _milvus_uri(settings)},
        primary_field="id",
        text_field="text",
        vector_field="embedding",
        drop_old=False,
        auto_id=False,
        consistency_level="Session",
        index_params={"metric_type": "COSINE", "index_type": "AUTOINDEX"},
        search_params={"metric_type": "COSINE"},
        metadata_schema={
            "doc_id": {"dtype": "VARCHAR", "max_length": 64},
            "chunk_index": {"dtype": "INT64"},
            "source": {"dtype": "VARCHAR", "max_length": 512},
            "created_at": {"dtype": "INT64"},
        },
    )
    return _vector_store


def get_retriever(*, top_k: int | None = None, settings: Settings | None = None):
    """LangChain Retriever，供 RAG 链使用。"""
    settings = settings or get_settings()
    k = top_k or settings.rag_top_k
    return get_vector_store(settings).as_retriever(search_kwargs={"k": k})


def langchain_search_similar(
    query: str,
    top_k: int,
    settings: Settings | None = None,
    *,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    from app.services.milvus_store import user_doc_prefix

    store = get_vector_store(settings)
    fetch_k = top_k * 4 if user_id else top_k
    results = store.similarity_search_with_score(query, k=min(fetch_k, 64))
    hits: list[dict[str, Any]] = []
    for doc, score in results:
        meta = doc.metadata or {}
        hits.append(
            {
                "id": meta.get("id") or meta.get("pk") or getattr(doc, "id", None),
                "score": float(score),
                "doc_id": meta.get("doc_id"),
                "chunk_index": meta.get("chunk_index"),
                "source": meta.get("source"),
                "text": doc.page_content,
            }
        )
    if user_id:
        prefix = user_doc_prefix(user_id)
        hits = [h for h in hits if str(h.get("doc_id", "")).startswith(prefix)]
        hits = hits[:top_k]
    return hits


def langchain_insert_chunks(
    doc_id: str,
    source: str,
    chunks: list[str],
    settings: Settings | None = None,
) -> int:
    if not chunks:
        return 0
    settings = settings or get_settings()
    store = get_vector_store(settings)
    now = int(time.time() * 1000)
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"doc_id": doc_id, "chunk_index": i, "source": source, "created_at": now}
        for i in range(len(chunks))
    ]
    store.add_texts(texts=chunks, metadatas=metadatas, ids=ids)
    return len(chunks)
