from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services.secrets_store import get_secrets_store

router = APIRouter(
    prefix="/secrets",
    tags=["secrets"],
    dependencies=[Depends(get_current_user)],
)


class SecretUpsertBody(BaseModel):
    api_key: str = Field(min_length=1, max_length=512)


@router.get("")
def list_secrets(user_id: str = Depends(get_current_user)):
    """仅返回是否已配置及掩码，永不返回明文 Key。"""
    items = get_secrets_store().list_status(user_id)
    return {"secrets": items}


@router.put("/{model_id}")
def upsert_secret(
    model_id: str,
    body: SecretUpsertBody,
    user_id: str = Depends(get_current_user),
):
    mid = model_id.strip()
    if not mid:
        raise HTTPException(400, "缺少 model_id")
    try:
        meta = get_secrets_store().set_secret(user_id, mid, body.api_key)
        return meta
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/{model_id}")
def delete_secret(model_id: str, user_id: str = Depends(get_current_user)):
    mid = model_id.strip()
    if not mid:
        raise HTTPException(400, "缺少 model_id")
    get_secrets_store().delete_secret(user_id, mid)
    return {"ok": True, "model_id": mid}
