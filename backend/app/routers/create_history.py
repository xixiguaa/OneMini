from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.deps import get_current_user, get_current_user_media
from app.services import create_history_store

router = APIRouter(prefix="/create-history", tags=["create-history"])


class CreateHistoryItemIn(BaseModel):
    id: str
    prompt: str = ""
    type: str = "image"
    url: str | None = None
    previewUrl: str | None = None
    jobId: str | None = None
    status: str = "DONE"
    modelId: str | None = None
    modelName: str | None = None
    createdAt: int | None = None
    sessionId: str | None = None
    parentId: str | None = None

    model_config = {"populate_by_name": True, "extra": "ignore"}


class PatchItemBody(BaseModel):
    prompt: str | None = None
    type: str | None = None
    url: str | None = None
    previewUrl: str | None = None
    jobId: str | None = None
    status: str | None = None
    modelId: str | None = None
    modelName: str | None = None
    sessionId: str | None = None
    parentId: str | None = None


class SyncBody(BaseModel):
    items: list[CreateHistoryItemIn] = Field(default_factory=list)


@router.get("/media/{item_id}")
def get_create_history_media(
    item_id: str,
    user_id: str = Depends(get_current_user_media),
):
    """<img> 通过 ?access_token= JWT 鉴权（无法带 Authorization 头）。"""
    path = create_history_store.media_path(user_id, item_id)
    if not path.is_file():
        raise HTTPException(404, "图片不存在或尚未缓存")
    media_type = "image/jpeg"
    try:
        head = path.read_bytes()[:12]
        if head.startswith(b"\x89PNG"):
            media_type = "image/png"
        elif head.startswith(b"GIF"):
            media_type = "image/gif"
        elif head.startswith(b"RIFF") and b"WEBP" in head:
            media_type = "image/webp"
    except OSError:
        pass
    return FileResponse(path, media_type=media_type)


@router.get("")
def list_create_history(user_id: str = Depends(get_current_user)):
    items = create_history_store.list_items(user_id)
    return {"items": items, "userId": user_id}


@router.post("", status_code=201)
def create_create_history_item(
    body: CreateHistoryItemIn,
    user_id: str = Depends(get_current_user),
):
    try:
        item = create_history_store.upsert_item(user_id, body.model_dump(exclude_none=True))
        return item
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/{item_id}")
def patch_create_history_item(
    item_id: str,
    body: PatchItemBody,
    user_id: str = Depends(get_current_user),
):
    patch = body.model_dump(exclude_none=True)
    item = create_history_store.patch_item(user_id, item_id, patch)
    if not item:
        raise HTTPException(404, "创作记录不存在")
    return item


@router.post("/sync")
def sync_create_history(
    body: SyncBody,
    user_id: str = Depends(get_current_user),
):
    payload = [i.model_dump(exclude_none=True) for i in body.items]
    result = create_history_store.sync_items(user_id, payload)
    items = create_history_store.list_items(user_id)
    return {"ok": True, **result, "items": items}


@router.delete("/sessions/{session_id}")
def delete_create_session(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    removed = create_history_store.delete_session(user_id, session_id)
    if removed <= 0:
        raise HTTPException(404, "会话不存在或已删除")
    return {"ok": True, "sessionId": session_id, "removed": removed}


@router.delete("/versions/{version_id}")
def delete_create_version(
    version_id: str,
    user_id: str = Depends(get_current_user),
):
    if not create_history_store.is_version_leaf(user_id, version_id):
        raise HTTPException(409, "存在后续编辑版本，无法删除")
    if not create_history_store.delete_version(user_id, version_id):
        raise HTTPException(404, "版本不存在或已删除")
    return {"ok": True, "versionId": version_id}
