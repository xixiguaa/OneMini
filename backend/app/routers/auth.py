"""注册 / 登录（邮箱或手机号 + 密码，无短信验证码）。"""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services import users_store
from app.services.auth_jwt import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

# 简易限流：防暴力破解（无需第三方验证码服务）
_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 300.0
_RATE_MAX = 15


def _rate_limit(key: str) -> None:
    now = time.time()
    bucket = _attempts[key]
    _attempts[key] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_attempts[key]) >= _RATE_MAX:
        raise HTTPException(429, "尝试次数过多，请 5 分钟后再试")
    _attempts[key].append(now)


def _reject_honeypot(website: str | None) -> None:
    if (website or "").strip():
        raise HTTPException(400, "请求无效")


class RegisterBody(BaseModel):
    email: str | None = None
    phone: str | None = None
    password: str = Field(min_length=8, max_length=128)
    website: str | None = Field(default=None, description="蜜罐，须为空")


class LoginBody(BaseModel):
    identifier: str = Field(min_length=3, max_length=128)
    password: str = Field(min_length=1, max_length=128)
    website: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: dict


@router.post("/register", response_model=AuthResponse)
def register(body: RegisterBody):
    _reject_honeypot(body.website)
    _rate_limit(f"reg:{body.email or ''}:{body.phone or ''}")
    try:
        user = users_store.register_user(
            email=body.email,
            phone=body.phone,
            password=body.password,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    token = create_access_token(user["id"])
    return AuthResponse(token=token, user=user)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginBody):
    _reject_honeypot(body.website)
    _rate_limit(f"login:{body.identifier.strip().lower()}")
    try:
        user = users_store.authenticate(body.identifier, body.password)
    except ValueError as exc:
        raise HTTPException(401, str(exc)) from exc
    token = create_access_token(user["id"])
    return AuthResponse(token=token, user=user)


@router.get("/me")
def me(user_id: str = Depends(get_current_user)):
    user = users_store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "用户不存在")
    return {"user": user}


@router.post("/logout")
def logout(_user_id: str = Depends(get_current_user)):
    """JWT 无状态：客户端删除 token 即可。"""
    return {"ok": True}
