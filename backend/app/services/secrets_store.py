"""服务端加密保管用户模型 API Key（前端不落库、不回显明文）。"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import Settings, get_settings

_lock = threading.Lock()


def _mask_hint(api_key: str) -> str:
    k = api_key.strip()
    if len(k) <= 8:
        return "****"
    return f"{k[:3]}…{k[-4:]}"


def _derive_fernet_key(master: str) -> bytes:
    digest = hashlib.sha256(master.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


class SecretsStore:
    def __init__(self, path: Path, master_key: str) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not master_key.strip():
            # 仅开发：进程内固定派生（生产必须在 .env 配置 SECRETS_MASTER_KEY）
            master_key = "onemini-dev-insecure-change-me"
        self._fernet = Fernet(_derive_fernet_key(master_key))
        self._data: dict[str, Any] = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.path.is_file():
            return {"users": {}}
        try:
            raw = self.path.read_bytes()
            decrypted = self._fernet.decrypt(raw)
            return json.loads(decrypted.decode("utf-8"))
        except (InvalidToken, json.JSONDecodeError, OSError):
            return {"users": {}}

    def _save(self) -> None:
        payload = json.dumps(self._data, ensure_ascii=False).encode("utf-8")
        encrypted = self._fernet.encrypt(payload)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_bytes(encrypted)
        os.replace(tmp, self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def _user_bucket(self, user_id: str) -> dict[str, Any]:
        users = self._data.setdefault("users", {})
        return users.setdefault(user_id, {})

    def set_secret(self, user_id: str, model_id: str, api_key: str) -> dict[str, str]:
        key = api_key.strip()
        if not key:
            raise ValueError("API Key 不能为空")
        token = self._fernet.encrypt(key.encode("utf-8")).decode("ascii")
        bucket = self._user_bucket(user_id)
        bucket[model_id] = {"token": token, "hint": _mask_hint(key)}
        self._save()
        return {"model_id": model_id, "configured": True, "hint": bucket[model_id]["hint"]}

    def delete_secret(self, user_id: str, model_id: str) -> bool:
        bucket = self._user_bucket(user_id)
        if model_id not in bucket:
            return False
        del bucket[model_id]
        self._save()
        return True

    def get_secret(self, user_id: str, model_id: str) -> str | None:
        bucket = self._user_bucket(user_id)
        entry = bucket.get(model_id)
        if not entry:
            return None
        try:
            return self._fernet.decrypt(entry["token"].encode("ascii")).decode("utf-8")
        except (InvalidToken, KeyError):
            return None

    def list_status(self, user_id: str) -> list[dict[str, Any]]:
        bucket = self._user_bucket(user_id)
        return [
            {"model_id": mid, "configured": True, "hint": meta.get("hint", "****")}
            for mid, meta in bucket.items()
        ]


_store: SecretsStore | None = None


def get_secrets_store(settings: Settings | None = None) -> SecretsStore:
    global _store
    settings = settings or get_settings()
    if _store is None:
        with _lock:
            if _store is None:
                _store = SecretsStore(
                    Path(settings.secrets_file),
                    settings.secrets_master_key,
                )
    return _store


def resolve_model_api_key(
    user_id: str,
    model_config_id: str | None,
    *,
    settings: Settings | None = None,
) -> str | None:
    """按模型配置 ID 从保险库取 Key；不回退到请求体中的客户端密钥。"""
    settings = settings or get_settings()
    if model_config_id:
        secret = get_secrets_store(settings).get_secret(user_id, model_config_id)
        if secret:
            return secret
    return (settings.openai_api_key or "").strip() or None
