"""OpenAI 兼容图片生成（火山方舟 Seedream 等）。"""

from __future__ import annotations

import base64
import re
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from app.config import get_settings
from app.services import create_history_store
from app.services.llm import resolve_llm_endpoint

_LOCAL_MEDIA_RE = re.compile(r"/api/platform/create-history/media/([^?/]+)")

# 通用 OpenAI 风格尺寸（非 Seedream）
GENERIC_ASPECT_TO_SIZE: dict[str, str] = {
    "smart": "1024x1024",
    "1:1": "1024x1024",
    "16:9": "1280x720",
    "9:16": "720x1280",
    "4:3": "1024x768",
    "3:4": "768x1024",
    "3:2": "1024x683",
    "2:3": "683x1024",
    "21:9": "1280x548",
}

# 火山 Seedream 2K 官方推荐像素（见 Ark 文档，总像素 ≥ 3686400）
SEEDREAM_ASPECT_TO_SIZE: dict[str, str] = {
    "smart": "2K",
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3024x1296",
}

# 火山 Seedream 4K 官方推荐像素
SEEDREAM_4K_ASPECT_TO_SIZE: dict[str, str] = {
    "smart": "4K",
    "1:1": "4096x4096",
    "4:3": "4608x3456",
    "3:4": "3456x4608",
    "16:9": "5120x2880",
    "9:16": "2880x5120",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
    "21:9": "6048x2592",
}


SEEDREAM_SUPPORTED_RATIOS = frozenset(SEEDREAM_ASPECT_TO_SIZE.keys()) - {"smart"}


def _normalize_resolution_tier(resolution: str | None) -> str:
    key = (resolution or "2k").strip().lower().replace("p", "")
    if key in ("4k", "4096", "ultra"):
        return "4k"
    return "2k"


def _is_seedream(provider: str | None, model: str | None) -> bool:
    prov = (provider or "").strip().lower()
    if prov in ("doubao", "bytedance"):
        return True
    name = (model or "").lower()
    return "seedream" in name or "seed-edit" in name


def _resolve_size(
    aspect_ratio: str | None,
    *,
    provider: str | None = None,
    model: str | None = None,
    resolution: str | None = None,
    width: int | None = None,
    height: int | None = None,
) -> str:
    if width and height and width > 0 and height > 0:
        return f"{int(width)}x{int(height)}"

    ratio_key = (aspect_ratio or "1:1").strip()
    if ratio_key == "smart":
        ratio_key = "1:1"

    tier = _normalize_resolution_tier(resolution)
    if _is_seedream(provider, model):
        size_map = SEEDREAM_4K_ASPECT_TO_SIZE if tier == "4k" else SEEDREAM_ASPECT_TO_SIZE
        if ratio_key not in size_map:
            ratio_key = "1:1"
        return size_map[ratio_key]

    if ratio_key not in GENERIC_ASPECT_TO_SIZE:
        ratio_key = "1:1"
    base = GENERIC_ASPECT_TO_SIZE[ratio_key]
    if tier == "4k":
        parts = base.split("x")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            return f"{int(parts[0]) * 2}x{int(parts[1]) * 2}"
    return base


def _extract_image_url(data: dict[str, Any]) -> str | None:
    items = data.get("data") or []
    if not items:
        return None
    first = items[0]
    url = first.get("url")
    if isinstance(url, str) and url.strip():
        return url.strip()
    b64 = first.get("b64_json")
    if isinstance(b64, str) and b64.strip():
        return f"data:image/png;base64,{b64.strip()}"
    return None


def _guess_mime(data: bytes) -> str:
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"GIF"):
        return "image/gif"
    if data[:4] == b"RIFF" and b"WEBP" in data[:16]:
        return "image/webp"
    return "image/jpeg"


def _bytes_to_data_uri(data: bytes) -> str:
    mime = _guess_mime(data)
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _is_non_public_image_ref(url: str) -> bool:
    ref = url.strip()
    if not ref or ref.startswith("data:"):
        return False
    if ref.startswith("/") or "/create-history/media/" in ref:
        return True
    try:
        parsed = urlparse(ref)
        host = (parsed.hostname or "").lower()
        if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
            return True
    except ValueError:
        pass
    return False


def resolve_image_ref_for_api(image_url: str | None, *, user_id: str = "default") -> str | None:
    """将本地代理图 / localhost 转为 Data URI，供 Seedream 等外网 API 使用。"""
    ref = (image_url or "").strip()
    if not ref:
        return None
    if ref.startswith("data:"):
        return ref
    if not _is_non_public_image_ref(ref):
        return ref

    path = ref
    uid = user_id
    if "://" in ref:
        parsed = urlparse(ref)
        path = parsed.path or ref
        q_uid = (parse_qs(parsed.query).get("userId") or [None])[0]
        if q_uid:
            uid = q_uid

    match = _LOCAL_MEDIA_RE.search(path)
    if match:
        item_id = match.group(1)
        media_file = create_history_store.media_path(uid, item_id)
        if media_file.is_file():
            return _bytes_to_data_uri(media_file.read_bytes())

    # 相对路径：向本机平台 API 拉取（需带 userId）
    fetch_path = path if path.startswith("/") else ref
    if "/create-history/media/" in fetch_path and "userId=" not in fetch_path:
        sep = "&" if "?" in fetch_path else "?"
        fetch_path = f"{fetch_path}{sep}userId={uid}"

    port = get_settings().port
    try:
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            resp = client.get(f"http://127.0.0.1:{port}{fetch_path}")
            resp.raise_for_status()
            return _bytes_to_data_uri(resp.content)
    except (httpx.HTTPError, OSError, ValueError) as exc:
        raise RuntimeError("无法读取待编辑的原图，请稍后重试或重新生成") from exc


def _parse_error_message(resp: httpx.Response, data: Any) -> str:
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            msg = err.get("message") or err.get("code")
            if msg:
                return str(msg)
        if isinstance(err, str) and err.strip():
            return err.strip()
        detail = data.get("detail") or data.get("message")
        if detail:
            return str(detail)
    text = resp.text.strip()
    if text:
        return text[:800]
    return f"HTTP {resp.status_code}"


async def generate_image(
    prompt: str,
    *,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    width: int | None = None,
    height: int | None = None,
    image_url: str | None = None,
    user_id: str | None = None,
    timeout: float = 180.0,
) -> dict[str, str]:
    text = (prompt or "").strip()
    if not text:
        raise ValueError("缺少 prompt")

    resolved_base, key = resolve_llm_endpoint(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
    )
    if not key:
        raise RuntimeError("未配置 API Key，请在「模型配置」中保存密钥")

    if not model:
        raise RuntimeError("未指定图片模型，请在创作页选择模型或在技能配置中绑定")

    size = _resolve_size(
        aspect_ratio,
        provider=provider,
        model=model,
        resolution=resolution,
        width=width,
        height=height,
    )
    url = resolved_base.rstrip("/") + "/images/generations"
    payload: dict[str, Any] = {
        "model": model,
        "prompt": text,
        "size": size,
        "response_format": "url",
        "watermark": False,
    }
    ref = resolve_image_ref_for_api(image_url, user_id=user_id or "default")
    if ref:
        payload["image"] = ref

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        try:
            data = resp.json()
        except ValueError:
            data = {}
        if resp.status_code >= 400:
            raise RuntimeError(_parse_error_message(resp, data))

    image_url = _extract_image_url(data)
    if not image_url:
        raise RuntimeError("模型未返回图片 URL")

    return {"url": image_url, "message": "图片生成成功"}


def supported_image_providers() -> frozenset[str]:
    return frozenset(
        {
            "doubao",
            "bytedance",
            "openai",
            "custom",
            "qwen",
            "bailian",
            "zhipu",
        }
    )
