from fastapi import Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.context import current_user_id
from app.services.auth_jwt import decode_access_token

_bearer = HTTPBearer(auto_error=False)


def _token_from_headers(
    creds: HTTPAuthorizationCredentials | None,
    authorization: str | None,
) -> str | None:
    if creds and creds.scheme.lower() == "bearer":
        return creds.credentials
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def _resolve_user_id_from_token(token: str, x_user_id: str | None) -> str:
    try:
        user_id = decode_access_token(token)
    except ValueError as exc:
        raise HTTPException(401, str(exc)) from exc
    header_uid = (x_user_id or "").strip()
    if header_uid and header_uid != user_id:
        raise HTTPException(403, "用户标识与登录状态不一致")
    current_user_id.set(user_id)
    return user_id


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    """所有业务接口须携带 Bearer Token。"""
    token = _token_from_headers(creds, authorization)
    if not token:
        raise HTTPException(401, "请先登录")
    return _resolve_user_id_from_token(token, x_user_id)


def get_current_user_media(
    access_token: str | None = Query(default=None, alias="access_token"),
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    """创作历史图片：<img> 通过 access_token 查询参数鉴权。"""
    token = (access_token or "").strip() or _token_from_headers(creds, authorization)
    if not token:
        raise HTTPException(401, "请先登录")
    return _resolve_user_id_from_token(token, x_user_id)
