from fastapi import Header

DEFAULT_USER_ID = "default"


def get_user_id(x_user_id: str | None = Header(default=None, alias="X-User-Id")) -> str:
    uid = (x_user_id or "").strip()
    return uid or DEFAULT_USER_ID
