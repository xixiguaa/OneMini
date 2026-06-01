"""
对话数据存储于 Milvus（集合 onemini_chat），可在 Attu 中浏览与管理。

实体模型（单集合 + entity_type 区分，通用分层）：
  - conversation：会话元数据（title、status、时间戳）
  - message：消息正文（role、type、content、attachments），content 向量化便于后续语义检索
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from pymilvus import Collection, CollectionSchema, DataType, FieldSchema, MilvusException, utility

from app.config import Settings, get_settings
from app.services.embeddings import embed_texts, get_embedding_dim
from app.services.milvus_store import _alias, connect_milvus

_chat_collection: Collection | None = None

ENTITY_CONVERSATION = "conversation"
ENTITY_MESSAGE = "message"
STATUS_ACTIVE = "active"
STATUS_DELETED = "deleted"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _get_chat_collection(settings: Settings) -> Collection:
    global _chat_collection
    connect_milvus(settings)
    name = settings.milvus_chat_collection
    alias = _alias()

    if _chat_collection is not None and _chat_collection.name == name:
        return _chat_collection

    dim = get_embedding_dim()

    if not utility.has_collection(name, using=alias):
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
            description="OneMini 对话：conversation + message（Attu 可见）",
        )
        col = Collection(name, schema, using=alias)
        col.create_index(
            field_name="embedding",
            index_params={"metric_type": "COSINE", "index_type": "AUTOINDEX"},
        )
    else:
        col = Collection(name, using=alias)

    col.load()
    _chat_collection = col
    return col


def _now() -> int:
    return int(time.time() * 1000)


def _embed_one(text: str) -> list[float]:
    t = (text or "").strip() or " "
    return embed_texts([t[:2000]])[0]


def _parse_attachments(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _parse_metadata(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _metadata_json_from_raw(raw: dict[str, Any]) -> str:
    meta: dict[str, Any] = {}
    fb = raw.get("feedback")
    if fb in ("like", "dislike"):
        meta["feedback"] = fb
    for key in (
        "parentId",
        "parent_id",
        "branchRootId",
        "branch_root_id",
        "variantIndex",
        "variant_index",
        "metadata",
        "action",
        "targetAssistantId",
        "workingMemory",
        "toolCalls",
    ):
        if key not in raw:
            continue
        val = raw.get(key)
        if val is None:
            continue
        if key in ("parent_id", "parentId"):
            meta["parentId"] = val
        elif key in ("branch_root_id", "branchRootId"):
            meta["branchRootId"] = val
        elif key in ("variant_index", "variantIndex"):
            meta["variantIndex"] = val
        elif key == "metadata" and isinstance(val, dict):
            meta.update(val)
        elif key in ("action", "targetAssistantId", "workingMemory", "toolCalls", "thinking"):
            meta[key] = val
    nested = raw.get("metadata")
    if isinstance(nested, dict):
        for k, v in nested.items():
            if v is not None:
                meta[k] = v
    return json.dumps(meta, ensure_ascii=False) if meta else ""


def _row_to_message(row: dict[str, Any]) -> dict[str, Any]:
    meta = _parse_metadata(row.get("metadata_json"))
    out: dict[str, Any] = {
        "id": row["id"],
        "role": row.get("role") or "user",
        "type": row.get("message_type") or "text",
        "content": row.get("content") or "",
        "skillId": row.get("skill_id") or "chat",
        "timestamp": row.get("created_at") or 0,
        "attachments": _parse_attachments(row.get("attachments_json")),
    }
    fb = meta.get("feedback")
    if fb in ("like", "dislike"):
        out["feedback"] = fb
    if meta.get("parentId"):
        out["parentId"] = meta["parentId"]
    if meta.get("branchRootId"):
        out["branchRootId"] = meta["branchRootId"]
    if meta.get("variantIndex") is not None:
        out["variantIndex"] = meta["variantIndex"]
    msg_meta: dict[str, Any] = {}
    for k in ("action", "targetAssistantId", "workingMemory", "toolCalls", "thinking"):
        if k in meta:
            msg_meta[k] = meta[k]
    if msg_meta:
        out["metadata"] = msg_meta
    return out


def _gen_title(messages: list[dict[str, Any]]) -> str:
    first = next((m for m in messages if m.get("role") == "user"), None)
    if not first:
        return "新对话"
    t = str(first.get("content") or "").replace("\n", " ").strip()
    return (t[:24] + "…") if len(t) > 24 else (t or "新对话")


def _ensure_user(user_id: str) -> str:
    return user_id or "default"


def list_conversations(user_id: str, *, include_messages: bool = False) -> list[dict[str, Any]]:
    settings = get_settings()
    col = _get_chat_collection(settings)
    uid = _escape(_ensure_user(user_id))
    expr = (
        f'entity_type == "{ENTITY_CONVERSATION}" '
        f'and user_id == "{uid}" '
        f'and status == "{STATUS_ACTIVE}"'
    )
    try:
        rows = col.query(
            expr=expr,
            output_fields=[
                "id",
                "title",
                "created_at",
                "updated_at",
                "user_id",
            ],
            limit=4096,
        )
    except MilvusException:
        return []

    rows.sort(key=lambda r: r.get("updated_at") or 0, reverse=True)
    result: list[dict[str, Any]] = []

    for row in rows:
        conv_id = row["id"]
        item: dict[str, Any] = {
            "id": conv_id,
            "title": row.get("title") or "新对话",
            "createdAt": row.get("created_at") or 0,
            "updatedAt": row.get("updated_at") or 0,
            "messages": [],
        }
        if include_messages:
            item["messages"] = _load_messages(col, conv_id)
            item["messageCount"] = len(item["messages"])
        else:
            item["messageCount"] = _count_messages(col, conv_id)
        result.append(item)

    return result


def _count_messages(col: Collection, conversation_id: str) -> int:
    cid = _escape(conversation_id)
    expr = (
        f'entity_type == "{ENTITY_MESSAGE}" '
        f'and conversation_id == "{cid}" '
        f'and status == "{STATUS_ACTIVE}"'
    )
    try:
        rows = col.query(expr=expr, output_fields=["id"], limit=16384)
        return len(rows)
    except MilvusException:
        return 0


def _load_messages(col: Collection, conversation_id: str) -> list[dict[str, Any]]:
    cid = _escape(conversation_id)
    expr = (
        f'entity_type == "{ENTITY_MESSAGE}" '
        f'and conversation_id == "{cid}" '
        f'and status == "{STATUS_ACTIVE}"'
    )
    try:
        rows = col.query(
            expr=expr,
            output_fields=[
                "id",
                "role",
                "message_type",
                "content",
                "skill_id",
                "sort_index",
                "created_at",
                "attachments_json",
                "metadata_json",
            ],
            limit=16384,
        )
    except MilvusException:
        return []

    rows.sort(key=lambda r: (r.get("sort_index") or 0, r.get("created_at") or 0))
    return [_row_to_message(r) for r in rows]


def get_conversation(user_id: str, conversation_id: str) -> dict[str, Any] | None:
    settings = get_settings()
    col = _get_chat_collection(settings)
    uid = _escape(_ensure_user(user_id))
    cid = _escape(conversation_id)
    expr = (
        f'id == "{cid}" '
        f'and entity_type == "{ENTITY_CONVERSATION}" '
        f'and user_id == "{uid}" '
        f'and status == "{STATUS_ACTIVE}"'
    )
    try:
        rows = col.query(
            expr=expr,
            output_fields=["id", "title", "created_at", "updated_at", "metadata_json"],
            limit=1,
        )
    except MilvusException:
        return None
    if not rows:
        return None
    row = rows[0]
    messages = _load_messages(col, conversation_id)
    conv_meta = _parse_conversation_meta(row.get("metadata_json"))
    out: dict[str, Any] = {
        "id": row["id"],
        "title": row.get("title") or "新对话",
        "createdAt": row.get("created_at") or 0,
        "updatedAt": row.get("updated_at") or 0,
        "messages": messages,
    }
    if conv_meta.get("activeLeafId"):
        out["activeLeafId"] = conv_meta["activeLeafId"]
    if conv_meta.get("workingMemory"):
        out["workingMemory"] = conv_meta["workingMemory"]
    return out


def create_conversation(
    user_id: str,
    *,
    conv_id: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    col = _get_chat_collection(settings)
    uid = _ensure_user(user_id)
    new_id = conv_id or uuid.uuid4().hex
    t = _now()
    label = title or "新对话"

    col.insert(
        [
            {
                "id": new_id,
                "user_id": uid,
                "entity_type": ENTITY_CONVERSATION,
                "conversation_id": new_id,
                "title": label,
                "role": "",
                "message_type": "",
                "skill_id": "",
                "content": "",
                "sort_index": 0,
                "status": STATUS_ACTIVE,
                "attachments_json": "",
                "metadata_json": "",
                "created_at": t,
                "updated_at": t,
                "embedding": _embed_one(label),
            }
        ]
    )
    col.flush()

    return {
        "id": new_id,
        "title": label,
        "createdAt": t,
        "updatedAt": t,
        "messages": [],
    }


def update_conversation(
    user_id: str,
    conversation_id: str,
    *,
    title: str | None = None,
) -> dict[str, Any] | None:
    conv = get_conversation(user_id, conversation_id)
    if not conv:
        return None
    if title is None:
        return conv

    settings = get_settings()
    col = _get_chat_collection(settings)
    _delete_by_ids(col, [conversation_id])
    t = _now()
    uid = _ensure_user(user_id)

    col.insert(
        [
            {
                "id": conversation_id,
                "user_id": uid,
                "entity_type": ENTITY_CONVERSATION,
                "conversation_id": conversation_id,
                "title": title,
                "role": "",
                "message_type": "",
                "skill_id": "",
                "content": "",
                "sort_index": 0,
                "status": STATUS_ACTIVE,
                "attachments_json": "",
                "metadata_json": "",
                "created_at": conv["createdAt"],
                "updated_at": t,
                "embedding": _embed_one(title),
            }
        ]
    )
    col.flush()
    return get_conversation(user_id, conversation_id)


def delete_conversation(user_id: str, conversation_id: str) -> bool:
    conv = get_conversation(user_id, conversation_id)
    if not conv:
        return False

    settings = get_settings()
    col = _get_chat_collection(settings)
    cid = _escape(conversation_id)

    col.delete(f'conversation_id == "{cid}" and entity_type == "{ENTITY_MESSAGE}"')
    col.delete(f'id == "{cid}" and entity_type == "{ENTITY_CONVERSATION}"')
    col.flush()
    return True


def _delete_by_ids(col: Collection, ids: list[str]) -> None:
    if not ids:
        return
    quoted = ", ".join(f'"{_escape(i)}"' for i in ids)
    col.delete(f"id in [{quoted}]")
    col.flush()


def _conversation_meta_json(
    *,
    active_leaf_id: str | None = None,
    working_memory: dict[str, Any] | None = None,
) -> str:
    meta: dict[str, Any] = {}
    if active_leaf_id:
        meta["activeLeafId"] = active_leaf_id
    if working_memory:
        meta["workingMemory"] = working_memory
    return json.dumps(meta, ensure_ascii=False) if meta else ""


def _parse_conversation_meta(raw: str | None) -> dict[str, Any]:
    return _parse_metadata(raw)


def replace_messages(
    user_id: str,
    conversation_id: str,
    messages: list[dict[str, Any]],
    *,
    active_leaf_id: str | None = None,
    working_memory: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    conv = get_conversation(user_id, conversation_id)
    if not conv:
        return None

    settings = get_settings()
    col = _get_chat_collection(settings)
    uid = _ensure_user(user_id)
    cid = _escape(conversation_id)

    old_msgs = col.query(
        expr=(
            f'entity_type == "{ENTITY_MESSAGE}" '
            f'and conversation_id == "{cid}"'
        ),
        output_fields=["id"],
        limit=16384,
    )
    if old_msgs:
        _delete_by_ids(col, [r["id"] for r in old_msgs])

    normalized: list[dict[str, Any]] = []
    texts_for_embed: list[str] = []
    for i, raw in enumerate(messages or []):
        msg_id = raw.get("id") or uuid.uuid4().hex
        content = str(raw.get("content") or "")
        ts = raw.get("timestamp") or raw.get("createdAt") or _now()
        attachments = raw.get("attachments")
        normalized.append(
            {
                "id": msg_id,
                "user_id": uid,
                "entity_type": ENTITY_MESSAGE,
                "conversation_id": conversation_id,
                "title": "",
                "role": raw.get("role") or "user",
                "message_type": raw.get("type") or "text",
                "skill_id": raw.get("skillId") or raw.get("skill_id") or "chat",
                "content": content,
                "sort_index": i,
                "status": STATUS_ACTIVE,
                "attachments_json": json.dumps(attachments, ensure_ascii=False)
                if attachments
                else "",
                "metadata_json": _metadata_json_from_raw(raw),
                "created_at": int(ts),
                "updated_at": int(ts),
            }
        )
        texts_for_embed.append(content[:2000] or " ")

    title = _gen_title(
        [
            {
                "role": m["role"],
                "content": m["content"],
            }
            for m in normalized
        ]
    )
    t = _now()

    if normalized:
        vectors = embed_texts(texts_for_embed)
        for i, row in enumerate(normalized):
            row["embedding"] = vectors[i]
        col.insert(normalized)
        col.flush()

    conv_meta = _conversation_meta_json(
        active_leaf_id=active_leaf_id,
        working_memory=working_memory,
    )
    _delete_by_ids(col, [conversation_id])
    col.insert(
        [
            {
                "id": conversation_id,
                "user_id": uid,
                "entity_type": ENTITY_CONVERSATION,
                "conversation_id": conversation_id,
                "title": title,
                "role": "",
                "message_type": "",
                "skill_id": "",
                "content": "",
                "sort_index": 0,
                "status": STATUS_ACTIVE,
                "attachments_json": "",
                "metadata_json": conv_meta,
                "created_at": conv["createdAt"],
                "updated_at": t,
                "embedding": _embed_one(title),
            }
        ]
    )
    col.flush()

    return get_conversation(user_id, conversation_id)


def set_message_feedback(
    user_id: str,
    conversation_id: str,
    message_id: str,
    feedback: str | None,
) -> dict[str, Any] | None:
    """更新单条消息点赞/点踩；feedback 为 None 表示清除。"""
    if feedback is not None and feedback not in ("like", "dislike"):
        raise ValueError("feedback 须为 like、dislike 或 null")

    conv = get_conversation(user_id, conversation_id)
    if not conv:
        return None

    settings = get_settings()
    col = _get_chat_collection(settings)
    uid = _escape(_ensure_user(user_id))
    mid = _escape(message_id)
    cid = _escape(conversation_id)
    expr = (
        f'id == "{mid}" '
        f'and entity_type == "{ENTITY_MESSAGE}" '
        f'and conversation_id == "{cid}" '
        f'and user_id == "{uid}" '
        f'and status == "{STATUS_ACTIVE}"'
    )
    try:
        rows = col.query(
            expr=expr,
            output_fields=[
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
            ],
            limit=1,
        )
    except MilvusException:
        return None

    if not rows:
        return None

    row = rows[0]
    meta = _parse_metadata(row.get("metadata_json"))
    if feedback:
        meta["feedback"] = feedback
    else:
        meta.pop("feedback", None)

    t = _now()
    content = row.get("content") or ""
    updated = {
        "id": row["id"],
        "user_id": row["user_id"],
        "entity_type": ENTITY_MESSAGE,
        "conversation_id": row["conversation_id"],
        "title": row.get("title") or "",
        "role": row.get("role") or "user",
        "message_type": row.get("message_type") or "text",
        "skill_id": row.get("skill_id") or "chat",
        "content": content,
        "sort_index": row.get("sort_index") or 0,
        "status": STATUS_ACTIVE,
        "attachments_json": row.get("attachments_json") or "",
        "metadata_json": json.dumps(meta, ensure_ascii=False) if meta else "",
        "created_at": row.get("created_at") or t,
        "updated_at": t,
        "embedding": _embed_one(content),
    }

    _delete_by_ids(col, [message_id])
    col.insert([updated])
    col.flush()
    return _row_to_message(updated)


def import_conversations(user_id: str, conversations: list[dict[str, Any]]) -> dict[str, int]:
    imported = 0
    for raw in conversations or []:
        cid = raw.get("id")
        if not cid:
            continue
        delete_conversation(user_id, cid)
        create_conversation(user_id, conv_id=cid, title=raw.get("title") or "新对话")
        replace_messages(user_id, cid, raw.get("messages") or [])
        imported += 1
    total = len(list_conversations(user_id))
    return {"imported": imported, "total": total}


def search_messages(
    user_id: str,
    query: str,
    *,
    top_k: int = 10,
) -> list[dict[str, Any]]:
    """按语义检索历史消息（可选能力）"""
    settings = get_settings()
    col = _get_chat_collection(settings)
    uid = _escape(_ensure_user(user_id))
    vec = _embed_one(query)
    results = col.search(
        data=[vec],
        anns_field="embedding",
        param={"metric_type": "COSINE"},
        limit=top_k,
        expr=(
            f'entity_type == "{ENTITY_MESSAGE}" '
            f'and user_id == "{uid}" '
            f'and status == "{STATUS_ACTIVE}"'
        ),
        output_fields=[
            "conversation_id",
            "role",
            "message_type",
            "content",
            "created_at",
        ],
    )
    hits: list[dict[str, Any]] = []
    for group in results:
        for hit in group:
            hits.append(
                {
                    "id": hit.id,
                    "score": float(hit.score),
                    "conversationId": hit.entity.get("conversation_id"),
                    "role": hit.entity.get("role"),
                    "type": hit.entity.get("message_type"),
                    "content": hit.entity.get("content"),
                    "timestamp": hit.entity.get("created_at"),
                }
            )
    return hits


def get_storage_info() -> dict[str, Any]:
    settings = get_settings()
    return {
        "engine": "milvus",
        "host": settings.milvus_host,
        "port": settings.milvus_port,
        "knowledge_collection": settings.milvus_collection,
        "chat_collection": settings.milvus_chat_collection,
        "attu_hint": f"http://{settings.milvus_host}:8000 或本地 Attu 连接 {settings.milvus_host}:{settings.milvus_port}",
    }
