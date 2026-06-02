"""用户账号：PostgreSQL + bcrypt（凭证从环境变量连接数据库）。"""

from __future__ import annotations

import re
import time
import uuid
from typing import Any

import bcrypt
from sqlalchemy import select

from app.db.models import UserRow
from app.db.session import get_session
from app.services.password_policy import validate_password

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
_PHONE_RE = re.compile(r"^1[3-9]\d{9}$")


def _hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(pwd: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pwd.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


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


def _row_to_record(row: UserRow) -> dict[str, Any]:
    return {
        "id": row.id,
        "email": row.email,
        "phone": row.phone,
        "password_hash": row.password_hash,
        "created_at": row.created_at,
    }


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

    with get_session() as session:
        if em and session.scalar(select(UserRow.id).where(UserRow.email == em).limit(1)):
            raise ValueError("该邮箱已注册")
        if ph and session.scalar(select(UserRow.id).where(UserRow.phone == ph).limit(1)):
            raise ValueError("该手机号已注册")

        user_id = str(uuid.uuid4())
        row = UserRow(
            id=user_id,
            email=em,
            phone=ph,
            password_hash=_hash_password(pwd),
            created_at=int(time.time() * 1000),
        )
        session.add(row)
        session.flush()
        return public_user(_row_to_record(row))


def authenticate(identifier: str, password: str) -> dict[str, Any]:
    key = (identifier or "").strip()
    if not key:
        raise ValueError("请输入邮箱或手机号")
    pwd = (password or "").strip()
    if not pwd:
        raise ValueError("请输入密码")

    with get_session() as session:
        row: UserRow | None = None
        if "@" in key:
            em = normalize_email(key)
            if em:
                row = session.scalar(select(UserRow).where(UserRow.email == em).limit(1))
        else:
            try:
                ph = normalize_phone(key)
                if ph:
                    row = session.scalar(select(UserRow).where(UserRow.phone == ph).limit(1))
            except ValueError:
                row = None
        if not row or not _verify_password(pwd, row.password_hash):
            raise ValueError("账号或密码错误")
        return public_user(_row_to_record(row))


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    uid = (user_id or "").strip()
    if not uid:
        return None
    with get_session() as session:
        row = session.get(UserRow, uid)
        return public_user(_row_to_record(row)) if row else None


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


def import_legacy_json(users: dict[str, Any], email_index: dict[str, str], phone_index: dict[str, str]) -> int:
    """从 users.json 导入（启动迁移一次）。"""
    count = 0
    with get_session() as session:
        for user_id, record in (users or {}).items():
            if session.get(UserRow, user_id):
                continue
            em = record.get("email")
            ph = record.get("phone")
            if em and session.scalar(select(UserRow.id).where(UserRow.email == em).limit(1)):
                continue
            if ph and session.scalar(select(UserRow.id).where(UserRow.phone == ph).limit(1)):
                continue
            row = UserRow(
                id=user_id,
                email=em,
                phone=ph,
                password_hash=record.get("password_hash") or "",
                created_at=int(record.get("created_at") or time.time() * 1000),
            )
            session.add(row)
            count += 1
        session.flush()
    return count
