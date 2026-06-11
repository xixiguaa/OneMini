#!/usr/bin/env python3
"""
Milvus 迁移到 BGE-M3 新集合：知识库 + 可选对话历史。

用法（在 backend 目录）:
  python scripts/migrate_knowledge_to_bgem3.py
  python scripts/migrate_knowledge_to_bgem3.py --with-chat
  python scripts/migrate_knowledge_to_bgem3.py --old onemini_knowledge --new onemini_knowledge_bgem3
"""

from __future__ import annotations

import argparse
import sys
import time
import warnings
from pathlib import Path

# 保证可 import app
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pymilvus import (
    Collection,
    CollectionSchema,
    DataType,
    FieldSchema,
    PyMilvusDeprecationWarning,
    utility,
)

warnings.filterwarnings("ignore", category=PyMilvusDeprecationWarning)

from app.config import get_settings
from app.services.embeddings import embed_texts, get_embedding_dim
from app.services.milvus_store import _alias, connect_milvus, flush_collection

CHAT_OUTPUT_FIELDS = [
    "id",
    "user_id",
    "entity_type",
    "conversation_id",
    "title",
    "role",
    "message_type",
    "skill_id",
    "content",
    "sort_index",
    "status",
    "attachments_json",
    "metadata_json",
    "created_at",
    "updated_at",
]


def _fetch_all_chunks(old_name: str) -> list[dict]:
    connect_milvus()
    if not utility.has_collection(old_name, using=_alias()):
        return []
    col = Collection(old_name, using=_alias())
    col.load()
    rows = col.query(
        expr="chunk_index >= 0",
        output_fields=["id", "doc_id", "chunk_index", "source", "text", "created_at"],
        limit=16384,
    )
    rows.sort(key=lambda r: (r.get("doc_id", ""), r.get("chunk_index", 0)))
    return rows


def _ensure_knowledge_collection(new_name: str, dim: int) -> Collection:
    connect_milvus()
    if utility.has_collection(new_name, using=_alias()):
        col = Collection(new_name, using=_alias())
        col.load()
        return col

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
    schema = CollectionSchema(fields, description="OneMini 知识库向量 (BGE-M3)")
    col = Collection(new_name, schema, using=_alias())
    col.create_index(
        field_name="embedding",
        index_params={"metric_type": "COSINE", "index_type": "AUTOINDEX"},
    )
    col.load()
    return col


def migrate(old_name: str, new_name: str, *, batch_size: int = 32) -> dict:
    settings = get_settings()
    dim = get_embedding_dim()
    print(f"嵌入模型: {settings.embedding_model}  维度: {dim}")
    print(f"迁移: {old_name} -> {new_name}")

    rows = _fetch_all_chunks(old_name)
    if not rows:
        print(f"旧集合 {old_name!r} 无数据或不存在，仅创建新集合。")
        _ensure_knowledge_collection(new_name, dim)
        return {"old_chunks": 0, "inserted": 0, "new_collection": new_name}

    new_col = _ensure_knowledge_collection(new_name, dim)
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        texts = [str(r.get("text") or "") for r in batch]
        vectors = embed_texts(texts)
        data = []
        for r, vec in zip(batch, vectors):
            data.append(
                {
                    "id": r["id"],
                    "doc_id": r["doc_id"],
                    "chunk_index": int(r.get("chunk_index") or 0),
                    "source": r.get("source") or r["doc_id"],
                    "text": r.get("text") or "",
                    "embedding": vec,
                    "created_at": int(r.get("created_at") or time.time() * 1000),
                }
            )
        new_col.insert(data)
        inserted += len(data)
        print(f"  已写入 {inserted}/{len(rows)} 块…")

    flush_collection(new_col, settings)
    print(f"完成: {inserted} 块 -> {new_name}")
    return {"old_chunks": len(rows), "inserted": inserted, "new_collection": new_name}


def _embed_chat_row(row: dict) -> list[float]:
    if row.get("entity_type") == "conversation":
        text = (row.get("title") or "新对话").strip() or " "
    else:
        text = (row.get("content") or " ").strip() or " "
    return embed_texts([text[:2000]])[0]


def _ensure_chat_collection(new_name: str, dim: int) -> Collection:
    connect_milvus()
    if utility.has_collection(new_name, using=_alias()):
        col = Collection(new_name, using=_alias())
        col.load()
        return col

    fields = [
        FieldSchema(
            name="id",
            dtype=DataType.VARCHAR,
            is_primary=True,
            auto_id=False,
            max_length=64,
        ),
        FieldSchema(name="user_id", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="entity_type", dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name="conversation_id", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=256),
        FieldSchema(name="role", dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name="message_type", dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name="skill_id", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=8192),
        FieldSchema(name="sort_index", dtype=DataType.INT64),
        FieldSchema(name="status", dtype=DataType.VARCHAR, max_length=16),
        FieldSchema(name="attachments_json", dtype=DataType.VARCHAR, max_length=8192),
        FieldSchema(name="metadata_json", dtype=DataType.VARCHAR, max_length=4096),
        FieldSchema(name="created_at", dtype=DataType.INT64),
        FieldSchema(name="updated_at", dtype=DataType.INT64),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=dim),
    ]
    schema = CollectionSchema(
        fields,
        description="OneMini 对话（BGE-M3 嵌入）",
    )
    col = Collection(new_name, schema, using=_alias())
    col.create_index(
        field_name="embedding",
        index_params={"metric_type": "COSINE", "index_type": "AUTOINDEX"},
    )
    col.load()
    return col


def migrate_chat(
    old_name: str,
    new_name: str,
    *,
    batch_size: int = 16,
) -> dict:
    settings = get_settings()
    dim = get_embedding_dim()
    print(f"\n对话迁移: {old_name} -> {new_name}  (dim={dim})")

    connect_milvus()
    if not utility.has_collection(old_name, using=_alias()):
        print(f"旧对话集合 {old_name!r} 不存在，仅创建新集合。")
        _ensure_chat_collection(new_name, dim)
        return {"old_rows": 0, "inserted": 0, "new_chat_collection": new_name}

    old_col = Collection(old_name, using=_alias())
    old_col.load()
    rows = old_col.query(
        expr='id != ""',
        output_fields=CHAT_OUTPUT_FIELDS,
        limit=16384,
    )
    if not rows:
        _ensure_chat_collection(new_name, dim)
        return {"old_rows": 0, "inserted": 0, "new_chat_collection": new_name}

    new_col = _ensure_chat_collection(new_name, dim)
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        data = []
        for r in batch:
            row = {k: r.get(k) for k in CHAT_OUTPUT_FIELDS}
            row["embedding"] = _embed_chat_row(r)
            for k in ("title", "role", "message_type", "skill_id", "content", "attachments_json", "metadata_json"):
                if row.get(k) is None:
                    row[k] = ""
            row["sort_index"] = int(row.get("sort_index") or 0)
            row["created_at"] = int(row.get("created_at") or time.time() * 1000)
            row["updated_at"] = int(row.get("updated_at") or row["created_at"])
            data.append(row)
        new_col.insert(data)
        inserted += len(data)
        print(f"  对话已写入 {inserted}/{len(rows)} 行…")

    flush_collection(new_col, settings)
    print(f"对话完成: {inserted} 行 -> {new_name}")
    return {"old_rows": len(rows), "inserted": inserted, "new_chat_collection": new_name}


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Milvus 知识库迁移到 BGE-M3 新集合")
    parser.add_argument("--old", default="onemini_knowledge", help="源集合名")
    parser.add_argument(
        "--new",
        default="onemini_knowledge_bgem3",
        help="目标集合名（应与 MILVUS_COLLECTION 一致）",
    )
    parser.add_argument("--batch-size", type=int, default=16, help="嵌入批大小")
    parser.add_argument(
        "--with-chat",
        action="store_true",
        help="同时迁移对话集合（默认源 onemini_chat -> onemini_chat_bgem3）",
    )
    parser.add_argument("--old-chat", default="onemini_chat", help="源对话集合")
    parser.add_argument(
        "--new-chat",
        default="onemini_chat_bgem3",
        help="目标对话集合（应与 MILVUS_CHAT_COLLECTION 一致）",
    )
    args = parser.parse_args()

    stats = migrate(args.old, args.new, batch_size=args.batch_size)
    print(stats)

    if args.with_chat:
        chat_stats = migrate_chat(
            args.old_chat,
            args.new_chat,
            batch_size=args.batch_size,
        )
        print(chat_stats)

    print(
        f"\n.env 建议:\n"
        f"  MILVUS_COLLECTION={args.new}\n"
        f"  MILVUS_CHAT_COLLECTION={args.new_chat if args.with_chat else settings.milvus_chat_collection}\n"
        f"当前: collection={settings.milvus_collection} chat={settings.milvus_chat_collection}"
    )


if __name__ == "__main__":
    main()
