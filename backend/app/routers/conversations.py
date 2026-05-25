from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import chat_store

router = APIRouter(prefix="/conversations", tags=["conversations"])


class MessageIn(BaseModel):
    id: str | None = None
    role: str = "user"
    type: str = "text"
    content: str = ""
    skillId: str = "chat"
    timestamp: int | None = None
    attachments: dict | list | None = None

    model_config = {"populate_by_name": True, "extra": "ignore"}


class ConversationIn(BaseModel):
    id: str | None = None
    title: str | None = None
    messages: list[MessageIn] = Field(default_factory=list)
    createdAt: int | None = None
    updatedAt: int | None = None


class ReplaceMessagesBody(BaseModel):
    messages: list[MessageIn]


class ImportBody(BaseModel):
    conversations: list[ConversationIn]


def _user_id(x_user_id: str | None) -> str:
    return (x_user_id or "default").strip() or "default"


def _milvus_unavailable(exc: Exception) -> HTTPException:
    return HTTPException(
        503,
        detail=f"Milvus 未就绪，请在 Attu 确认连接后重试: {exc}",
    )


@router.get("")
def list_conversations(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    include: str | None = Query(default=None),
):
    user_id = _user_id(x_user_id)
    try:
        items = chat_store.list_conversations(
            user_id,
            include_messages=include == "messages",
        )
        return {"conversations": items, "userId": user_id}
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc


@router.post("", status_code=201)
def create_conversation(
    body: ConversationIn | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    user_id = _user_id(x_user_id)
    payload = body or ConversationIn()
    try:
        return chat_store.create_conversation(
            user_id,
            conv_id=payload.id,
            title=payload.title,
        )
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc


@router.post("/import")
def import_conversations(
    body: ImportBody,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    user_id = _user_id(x_user_id)
    raw = [c.model_dump(by_alias=True) for c in body.conversations]
    try:
        return chat_store.import_conversations(user_id, raw)
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc


@router.get("/storage/info")
def storage_info():
    return chat_store.get_storage_info()


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    user_id = _user_id(x_user_id)
    try:
        conv = chat_store.get_conversation(user_id, conversation_id)
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc
    if not conv:
        raise HTTPException(404, "会话不存在")
    return conv


@router.patch("/{conversation_id}")
def patch_conversation(
    conversation_id: str,
    body: ConversationIn,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    user_id = _user_id(x_user_id)
    try:
        conv = chat_store.update_conversation(
            user_id,
            conversation_id,
            title=body.title,
        )
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc
    if not conv:
        raise HTTPException(404, "会话不存在")
    return conv


@router.delete("/{conversation_id}")
def remove_conversation(
    conversation_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    user_id = _user_id(x_user_id)
    try:
        ok = chat_store.delete_conversation(user_id, conversation_id)
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc
    if not ok:
        raise HTTPException(404, "会话不存在")
    return {"ok": True}


@router.put("/{conversation_id}/messages")
def replace_messages(
    conversation_id: str,
    body: ReplaceMessagesBody,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    user_id = _user_id(x_user_id)
    messages = [m.model_dump(by_alias=True) for m in body.messages]
    try:
        conv = chat_store.replace_messages(user_id, conversation_id, messages)
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc
    if not conv:
        raise HTTPException(404, "会话不存在")
    return conv


@router.post("/search")
def search_messages(
    body: dict,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(400, "缺少 query")
    user_id = _user_id(x_user_id)
    top_k = int(body.get("top_k") or 10)
    try:
        hits = chat_store.search_messages(user_id, query, top_k=top_k)
        return {"hits": hits}
    except Exception as exc:
        raise _milvus_unavailable(exc) from exc
