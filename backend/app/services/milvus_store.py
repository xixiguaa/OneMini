import time
import uuid
from typing import Any

from pymilvus import (
    Collection,
    CollectionSchema,
    DataType,
    FieldSchema,
    MilvusException,
    connections,
    utility,
)

from app.config import Settings, get_settings
from app.services.embeddings import embed_texts, get_embedding_dim

_connected = False
_collection: Collection | None = None


def _alias() -> str:
    return "onemini"


def connect_milvus(settings: Settings | None = None) -> None:
    global _connected
    settings = settings or get_settings()
    if _connected and connections.has_connection(_alias()):
        return
    connections.connect(
        alias=_alias(),
        host=settings.milvus_host,
        port=str(settings.milvus_port),
    )
    _connected = True


def disconnect_milvus() -> None:
    global _connected, _collection
    try:
        from app.services.langchain_store import reset_vector_store

        reset_vector_store()
    except ImportError:
        pass
    if connections.has_connection(_alias()):
        connections.disconnect(_alias())
    _connected = False
    _collection = None


def ping_milvus(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    try:
        connect_milvus(settings)
        version = utility.get_server_version(using=_alias())
        return {
            "ok": True,
            "host": settings.milvus_host,
            "port": settings.milvus_port,
            "version": version,
        }
    except Exception as exc:
        return {
            "ok": False,
            "host": settings.milvus_host,
            "port": settings.milvus_port,
            "error": str(exc),
        }


def _get_collection(settings: Settings) -> Collection:
    global _collection
    connect_milvus(settings)
    name = settings.milvus_collection

    if _collection is not None and _collection.name == name:
        return _collection

    dim = get_embedding_dim()

    if not utility.has_collection(name, using=_alias()):
        fields = [
            FieldSchema(
                name="id",
                dtype=DataType.VARCHAR,
                is_primary=True,
                auto_id=False,
                max_length=64,
            ),
            FieldSchema(name="doc_id", dtype=DataType.VARCHAR, max_length=64),
            FieldSchema(name="chunk_index", dtype=DataType.INT64),
            FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=512),
            FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=8192),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=dim),
            FieldSchema(name="created_at", dtype=DataType.INT64),
        ]
        schema = CollectionSchema(fields, description="OneMini 知识库向量")
        col = Collection(name, schema, using=_alias())
        col.create_index(
            field_name="embedding",
            index_params={
                "metric_type": "COSINE",
                "index_type": "AUTOINDEX",
            },
        )
    else:
        col = Collection(name, using=_alias())

    col.load()
    _collection = col
    return col


def _insert_chunks_pymilvus(
    doc_id: str,
    source: str,
    chunks: list[str],
    settings: Settings,
) -> int:
    col = _get_collection(settings)
    vectors = embed_texts(chunks)
    now = int(time.time() * 1000)
    data = [
        {
            "id": f"{doc_id}_{i}",
            "doc_id": doc_id,
            "chunk_index": i,
            "source": source,
            "text": chunks[i],
            "embedding": vectors[i],
            "created_at": now,
        }
        for i in range(len(chunks))
    ]
    col.insert(data)
    col.flush()
    return len(chunks)


def _search_similar_pymilvus(
    query: str,
    top_k: int,
    settings: Settings,
) -> list[dict[str, Any]]:
    col = _get_collection(settings)
    vec = embed_texts([query])[0]
    results = col.search(
        data=[vec],
        anns_field="embedding",
        param={"metric_type": "COSINE"},
        limit=top_k,
        output_fields=["doc_id", "chunk_index", "source", "text"],
    )
    hits: list[dict[str, Any]] = []
    for group in results:
        for hit in group:
            hits.append(
                {
                    "id": hit.id,
                    "score": float(hit.score),
                    "doc_id": hit.entity.get("doc_id"),
                    "chunk_index": hit.entity.get("chunk_index"),
                    "source": hit.entity.get("source"),
                    "text": hit.entity.get("text"),
                }
            )
    return hits


def insert_chunks(
    doc_id: str,
    source: str,
    chunks: list[str],
    settings: Settings | None = None,
) -> int:
    if not chunks:
        return 0

    settings = settings or get_settings()
    _get_collection(settings)

    try:
        from app.services.langchain_store import langchain_insert_chunks

        return langchain_insert_chunks(doc_id, source, chunks, settings)
    except Exception:
        return _insert_chunks_pymilvus(doc_id, source, chunks, settings)


def delete_document(doc_id: str, settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    col = _get_collection(settings)
    expr = f'doc_id == "{doc_id}"'
    col.delete(expr)
    col.flush()
    return 1


def search_similar(
    query: str,
    top_k: int | None = None,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    settings = settings or get_settings()
    k = top_k or settings.rag_top_k
    _get_collection(settings)

    try:
        from app.services.langchain_store import langchain_search_similar

        return langchain_search_similar(query, k, settings)
    except Exception:
        return _search_similar_pymilvus(query, k, settings)


def list_documents(settings: Settings | None = None) -> list[dict[str, Any]]:
    settings = settings or get_settings()
    col = _get_collection(settings)

    try:
        rows = col.query(
            expr="chunk_index >= 0",
            output_fields=["doc_id", "source", "chunk_index", "created_at"],
            limit=16384,
        )
    except MilvusException:
        return []

    by_doc: dict[str, dict[str, Any]] = {}
    for row in rows:
        doc_id = row["doc_id"]
        if doc_id not in by_doc:
            by_doc[doc_id] = {
                "doc_id": doc_id,
                "source": row.get("source") or doc_id,
                "chunks": 0,
                "created_at": row.get("created_at") or 0,
            }
        by_doc[doc_id]["chunks"] += 1
        created = row.get("created_at") or 0
        if created < by_doc[doc_id]["created_at"] or by_doc[doc_id]["created_at"] == 0:
            by_doc[doc_id]["created_at"] = created

    return sorted(by_doc.values(), key=lambda x: x["created_at"], reverse=True)


def new_doc_id() -> str:
    return uuid.uuid4().hex[:16]
