"""MinIO 对象存储（创作媒体、公共画廊）；凭证仅从环境变量读取。"""

from __future__ import annotations

import io
from typing import Any

from minio import Minio
from minio.error import S3Error

from app.config import Settings, get_settings

_client: Minio | None = None


def _parse_endpoint(endpoint: str) -> tuple[str, bool]:
    raw = (endpoint or "127.0.0.1:9000").strip()
    secure = False
    if raw.startswith("https://"):
        secure = True
        raw = raw[8:]
    elif raw.startswith("http://"):
        raw = raw[7:]
    return raw.split("/")[0], secure


def get_minio_client(settings: Settings | None = None) -> Minio:
    global _client
    if _client is not None:
        return _client
    settings = settings or get_settings()
    if not settings.minio_access_key or not settings.minio_secret_key:
        raise ValueError(
            "未配置 MinIO 凭证：请设置 MINIO_ACCESS_KEY 与 MINIO_SECRET_KEY（使用 .env，勿硬编码）"
        )
    host, secure_from_url = _parse_endpoint(settings.minio_endpoint)
    secure = settings.minio_secure or secure_from_url
    _client = Minio(
        host,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
        region=settings.minio_region or None,
    )
    return _client


def ensure_bucket(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    client = get_minio_client(settings)
    bucket = settings.minio_bucket
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    return bucket


def user_media_object_key(user_id: str, item_id: str) -> str:
    from app.services.storage_ids import safe_item_id, safe_user_id

    return f"users/{safe_user_id(user_id)}/media/{safe_item_id(item_id)}.bin"


def public_media_object_key(item_id: str) -> str:
    from app.services.storage_ids import safe_item_id

    return f"public/gallery/{safe_item_id(item_id)}.bin"


def put_bytes(
    object_key: str,
    data: bytes,
    *,
    content_type: str = "application/octet-stream",
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    client = get_minio_client(settings)
    bucket = ensure_bucket(settings)
    client.put_object(
        bucket,
        object_key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def get_bytes(object_key: str, settings: Settings | None = None) -> bytes | None:
    settings = settings or get_settings()
    client = get_minio_client(settings)
    bucket = settings.minio_bucket
    try:
        resp = client.get_object(bucket, object_key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()
    except S3Error as exc:
        if exc.code in ("NoSuchKey", "NoSuchObject"):
            return None
        raise


def exists(object_key: str, settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    client = get_minio_client(settings)
    bucket = settings.minio_bucket
    try:
        client.stat_object(bucket, object_key)
        return True
    except S3Error as exc:
        if exc.code in ("NoSuchKey", "NoSuchObject"):
            return False
        raise


def delete_object(object_key: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    client = get_minio_client(settings)
    bucket = settings.minio_bucket
    try:
        client.remove_object(bucket, object_key)
    except S3Error as exc:
        if exc.code in ("NoSuchKey", "NoSuchObject"):
            return
        raise


def copy_object(
    src_key: str,
    dest_key: str,
    settings: Settings | None = None,
) -> None:
    settings = settings or get_settings()
    client = get_minio_client(settings)
    bucket = ensure_bucket(settings)
    from minio.commonconfig import CopySource

    client.copy_object(bucket, dest_key, CopySource(bucket, src_key))


def ping_minio(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    try:
        if not settings.minio_access_key or not settings.minio_secret_key:
            return {
                "ok": False,
                "error": "未配置 MINIO_ACCESS_KEY / MINIO_SECRET_KEY",
            }
        client = get_minio_client(settings)
        bucket = settings.minio_bucket
        exists_bucket = client.bucket_exists(bucket)
        if not exists_bucket:
            ensure_bucket(settings)
        return {
            "ok": True,
            "endpoint": settings.minio_endpoint,
            "bucket": bucket,
        }
    except Exception as exc:
        return {
            "ok": False,
            "endpoint": settings.minio_endpoint,
            "bucket": settings.minio_bucket,
            "error": str(exc),
        }


def guess_media_type(data: bytes) -> str:
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"GIF"):
        return "image/gif"
    if data[:4] == b"RIFF" and b"WEBP" in data[:16]:
        return "image/webp"
    if data.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if len(data) >= 8 and data[4:8] == b"ftyp":
        return "video/mp4"
    return "application/octet-stream"
