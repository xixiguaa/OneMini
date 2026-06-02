from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import get_current_user, get_current_user_media
from app.services import create_history_store, minio_storage, public_gallery_store

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
    aspectRatio: str | None = None
    editAction: str | None = None

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
    aspectRatio: str | None = None
    editAction: str | None = None


class SyncBody(BaseModel):
    items: list[CreateHistoryItemIn] = Field(default_factory=list)


class PublishPublicBody(BaseModel):
    title: str = Field(min_length=1, max_length=20)
    description: str = Field(default="", max_length=500)


def _media_response(data: bytes) -> Response:
    return Response(content=data, media_type=minio_storage.guess_media_type(data))


@router.get("/media/{item_id}")
def get_create_history_media(
    item_id: str,
    user_id: str = Depends(get_current_user_media),
):
    """<img> 通过 ?access_token= JWT 鉴权（无法带 Authorization 头）。"""
    data = create_history_store.read_media_bytes(user_id, item_id)
    if not data:
        raise HTTPException(404, "媒体不存在或尚未缓存")
    return _media_response(data)


@router.get("/public")
def list_public_gallery(
    type: str | None = Query(default=None, alias="type"),
    _user_id: str = Depends(get_current_user),
):
    """发现页 / 公共短片：所有登录用户可见的公共作品。"""
    items = public_gallery_store.list_items(type)
    return {"items": items}


@router.get("/public/media/{item_id}")
def get_public_gallery_media(
    item_id: str,
    _user_id: str = Depends(get_current_user_media),
):
    data = public_gallery_store.read_media_bytes(item_id)
    if not data:
        raise HTTPException(404, "媒体不存在")
    return _media_response(data)


@router.post("/public/{item_id}", status_code=201)
def publish_to_public_gallery(
    item_id: str,
    body: PublishPublicBody,
    user_id: str = Depends(get_current_user),
):
    """将个人创作发布到发现页 / 公共短片。"""
    try:
        item = public_gallery_store.publish_item(
            user_id,
            item_id,
            title=body.title.strip(),
            description=body.description.strip(),
        )
        return item
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


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
    cascade: bool = Query(default=False),
    user_id: str = Depends(get_current_user),
):
    if cascade:
        if not create_history_store.delete_version_cascade(user_id, version_id):
            raise HTTPException(404, "版本不存在或已删除")
        return {"ok": True, "versionId": version_id, "cascade": True}
    if not create_history_store.is_version_leaf(user_id, version_id):
        raise HTTPException(409, "存在后续编辑版本，无法删除")
    if not create_history_store.delete_version(user_id, version_id):
        raise HTTPException(404, "版本不存在或已删除")
    return {"ok": True, "versionId": version_id}
