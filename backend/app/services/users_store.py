"""用户账号：邮箱或手机号 + 密码（bcrypt）。"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import bcrypt

from app.config import get_settings
from app.services.password_policy import validate_password

def _hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(pwd: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False
_lock = threading.Lock()

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
_PHONE_RE = re.compile(r"^1[3-9]\d{9}$")


def _users_path() -> Path:
    base = Path(get_settings().secrets_file).resolve().parent
    return base / "users.json"


def _load() -> dict[str, Any]:
    path = _users_path()
    if not path.is_file():
        return {"users": {}, "email_index": {}, "phone_index": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("users", {})
            data.setdefault("email_index", {})
            data.setdefault("phone_index", {})
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return {"users": {}, "email_index": {}, "phone_index": {}}


def _save(data: dict[str, Any]) -> None:
    path = _users_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def normalize_email(email: str | None) -> str | None:
    if not email:
        return None
    e = email.strip().lower()
    if not e or not _EMAIL_RE.match(e):
        raise ValueError("邮箱格式不正确")
    return e


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone.strip())
    if digits.startswith("86") and len(digits) == 13:
        digits = digits[2:]
    if not _PHONE_RE.match(digits):
        raise ValueError("手机号须为 11 位中国大陆号码")
    return digits


def register_user(
    *,
    email: str | None,
    phone: str | None,
    password: str,
) -> dict[str, Any]:
    em = normalize_email(email)
    ph = normalize_phone(phone)
    if not em and not ph:
        raise ValueError("请填写邮箱或手机号至少一项")
    pwd = (password or "").strip()
    validate_password(pwd)

    with _lock:
        data = _load()
        email_index: dict[str, str] = data["email_index"]
        phone_index: dict[str, str] = data["phone_index"]
        if em and em in email_index:
            raise ValueError("该邮箱已注册")
        if ph and ph in phone_index:
            raise ValueError("该手机号已注册")

        user_id = str(uuid.uuid4())
        record = {
            "id": user_id,
            "email": em,
            "phone": ph,
            "password_hash": _hash_password(pwd),
            "created_at": int(time.time() * 1000),
        }
        data["users"][user_id] = record
        if em:
            email_index[em] = user_id
        if ph:
            phone_index[ph] = user_id
        _save(data)
        return public_user(record)


def authenticate(identifier: str, password: str) -> dict[str, Any]:
    key = (identifier or "").strip()
    if not key:
        raise ValueError("请输入邮箱或手机号")
    pwd = (password or "").strip()
    if not pwd:
        raise ValueError("请输入密码")

    with _lock:
        data = _load()
        user_id: str | None = None
        if "@" in key:
            user_id = data["email_index"].get(normalize_email(key) or "")
        else:
            try:
                user_id = data["phone_index"].get(normalize_phone(key) or "")
            except ValueError:
                user_id = None
        if not user_id:
            raise ValueError("账号或密码错误")
        record = data["users"].get(user_id)
        if not record or not _verify_password(pwd, record.get("password_hash", "")):
            raise ValueError("账号或密码错误")
        return public_user(record)


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    uid = (user_id or "").strip()
    if not uid:
        return None
    with _lock:
        record = _load()["users"].get(uid)
        return public_user(record) if record else None


def public_user(record: dict[str, Any] | None) -> dict[str, Any]:
    if not record:
        raise ValueError("用户不存在")
    label = record.get("email") or record.get("phone") or record["id"][:8]
    return {
        "id": record["id"],
        "email": record.get("email"),
        "phone": record.get("phone"),
        "displayName": label,
        "createdAt": record.get("created_at"),
    }
