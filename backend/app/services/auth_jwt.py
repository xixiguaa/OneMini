"""JWT 签发与校验。"""

from __future__ import annotations

import time
from typing import Any

import jwt

from app.config import get_settings

ALGORITHM = "HS256"


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + settings.jwt_expire_seconds,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str:
    settings = get_settings()
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise ValueError("无效或已过期的登录状态") from exc
    sub = data.get("sub")
    if not sub or not isinstance(sub, str):
        raise ValueError("无效的令牌")
    return sub.strip()
