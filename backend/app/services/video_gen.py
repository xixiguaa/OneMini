"""火山方舟 Seedance 等视频生成（异步任务）。"""

from __future__ import annotations

import re
from typing import Any

import httpx

from app.services.llm import resolve_llm_endpoint

# 任务进行中
_PENDING_STATUSES = frozenset(
    {
        "queued",
        "running",
        "pending",
        "processing",
        "wait",
        "submitted",
        "in_progress",
    }
)
_SUCCESS_STATUSES = frozenset({"succeeded", "success", "done", "completed"})
_FAIL_STATUSES = frozenset({"failed", "expired", "cancelled", "canceled", "error"})


def supported_video_providers() -> frozenset[str]:
    return frozenset({"doubao", "bytedance", "kling", "custom"})


def _parse_error_message(resp: httpx.Response, data: Any) -> str:
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            msg = err.get("message") or err.get("code")
            if msg:
                return str(msg)
        if isinstance(err, str) and err.strip():
            return err.strip()
        for key in ("message", "detail", "msg"):
            val = data.get(key)
            if val:
                return str(val)
    text = resp.text.strip()
    if text:
        return text[:800]
    return f"HTTP {resp.status_code}"


def _map_resolution(resolution: str | None) -> str:
    key = (resolution or "720").strip().lower().replace("p", "")
    return {"480": "480p", "720": "720p", "1080": "1080p"}.get(key, "720p")


def _parse_duration_seconds(prompt: str, default: int = 5) -> int:
    text = prompt or ""
    match = re.search(r"(\d+)\s*秒", text)
    if match:
        return max(4, min(15, int(match.group(1))))
    match = re.search(r"(\d+)\s*s\b", text, re.I)
    if match:
        return max(4, min(15, int(match.group(1))))
    return default


def _normalize_ratio(aspect_ratio: str | None) -> str:
    ratio = (aspect_ratio or "16:9").strip()
    if ratio in ("smart", "auto", "adaptive"):
        return "16:9"
    return ratio


def _video_tasks_base(resolved_base: str) -> str:
    base = resolved_base.rstrip("/")
    if base.endswith("/contents/generations/tasks"):
        return base
    return f"{base}/contents/generations/tasks"


def _build_content(prompt: str, image_base64: str | None) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt.strip()}]
    if image_base64:
        ref = image_base64.strip()
        if not ref.startswith("data:"):
            ref = f"data:image/jpeg;base64,{ref}"
        content.append({"type": "image_url", "image_url": {"url": ref}})
    return content


def _extract_task_id(data: dict[str, Any]) -> str | None:
    for key in ("id", "task_id", "taskId", "job_id", "jobId"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    task = data.get("task")
    if isinstance(task, dict):
        for key in ("id", "task_id"):
            val = task.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    return None


def _normalize_status(raw: str | None) -> str:
    val = (raw or "").strip().lower()
    if val in _SUCCESS_STATUSES:
        return "succeeded"
    if val in _FAIL_STATUSES:
        return "failed"
    if val in _PENDING_STATUSES or not val:
        return "running"
    return val


def _extract_video_url(data: dict[str, Any]) -> str | None:
    content = data.get("content")
    if isinstance(content, dict):
        for key in ("video_url", "url", "download_url"):
            val = content.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    output = data.get("output")
    if isinstance(output, dict):
        for key in ("video_url", "url"):
            val = output.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    result = data.get("result")
    if isinstance(result, dict):
        for key in ("video_url", "url"):
            val = result.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    for key in ("video_url", "url"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


async def create_video_task(
    prompt: str,
    *,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    image_base64: str | None = None,
    duration: int | None = None,
    timeout: float = 60.0,
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
        raise RuntimeError("未指定视频模型，请在创作页选择模型或在技能配置中绑定")

    url = _video_tasks_base(resolved_base)
    payload: dict[str, Any] = {
        "model": model,
        "content": _build_content(text, image_base64),
        "ratio": _normalize_ratio(aspect_ratio),
        "resolution": _map_resolution(resolution),
        "duration": duration if duration is not None else _parse_duration_seconds(text),
        "watermark": False,
    }

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

    if not isinstance(data, dict):
        raise RuntimeError("视频 API 返回格式异常")

    task_id = _extract_task_id(data)
    if not task_id:
        raise RuntimeError("视频 API 未返回任务 ID")

    return {
        "jobId": task_id,
        "status": "running",
        "message": "视频生成任务已提交",
    }


async def query_video_task(
    task_id: str,
    *,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    timeout: float = 30.0,
) -> dict[str, str | None]:
    tid = (task_id or "").strip()
    if not tid:
        raise ValueError("缺少 task_id")

    resolved_base, key = resolve_llm_endpoint(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
    )
    if not key:
        raise RuntimeError("未配置 API Key")

    url = f"{_video_tasks_base(resolved_base)}/{tid}"

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {key}"},
        )
        try:
            data = resp.json()
        except ValueError:
            data = {}
        if resp.status_code >= 400:
            raise RuntimeError(_parse_error_message(resp, data))

    if not isinstance(data, dict):
        raise RuntimeError("查询任务返回格式异常")

    status = _normalize_status(
        str(data.get("status") or data.get("task_status") or data.get("state") or ""),
    )
    video_url = _extract_video_url(data)
    message = data.get("message")
    if isinstance(message, dict):
        message = message.get("message") or message.get("detail")
    return {
        "status": status,
        "url": video_url,
        "message": str(message) if message else None,
    }
