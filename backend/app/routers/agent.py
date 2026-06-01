import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services.raw_extract import extract_text, is_allowed_suffix, normalize_text_content
from app.services.image_gen import generate_image, supported_image_providers
from app.services.video_gen import (
    create_video_task,
    query_video_task,
    supported_video_providers,
)
from app.services.llm import (
    PROVIDER_BASE_URLS,
    chat_completion,
    stream_chat_completion,
)
from app.services.secrets_store import resolve_model_api_key

router = APIRouter(
    prefix="/agent",
    tags=["agent"],
    dependencies=[Depends(get_current_user)],
)

OPENAI_COMPATIBLE_PROVIDERS = frozenset(
    {
        "openai",
        "deepseek",
        "anthropic",
        "zhipu",
        "custom",
        "qwen",
        "bailian",
        "doubao",
        "bytedance",
        "yuanbao",
        "gemini",
        "grok",
        "meta",
        "minimax",
        "moonshot",
        "nanobanana",
        "kling",
    }
)


class ChatMessage(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str | None = None
    provider: str | None = None
    base_url: str | None = None
    model_config_id: str | None = None
    temperature: float = 0.2


class ImageGenRequest(BaseModel):
    prompt: str
    model: str | None = None
    provider: str | None = None
    base_url: str | None = None
    model_config_id: str | None = None
    aspect_ratio: str | None = None
    resolution: str | None = None
    width: int | None = None
    height: int | None = None
    image_url: str | None = None


class VideoGenRequest(BaseModel):
    prompt: str
    model: str | None = None
    provider: str | None = None
    base_url: str | None = None
    model_config_id: str | None = None
    aspect_ratio: str | None = None
    resolution: str | None = None
    image_base64: str | None = None
    duration: int | None = None


class VideoTaskQuery(BaseModel):
    job_id: str
    provider: str | None = None
    base_url: str | None = None
    model_config_id: str | None = None


def _resolve_chat_url(provider: str | None, base_url: str | None) -> str:
    url = (base_url or "").strip()
    if not url and provider:
        url = PROVIDER_BASE_URLS.get(provider, "")
    return url.rstrip("/")


@router.post("/chat")
async def agent_chat(req: AgentChatRequest, user_id: str = Depends(get_current_user)):
    api_key = resolve_model_api_key(user_id, req.model_config_id)
    if not api_key and req.provider != "tencent":
        raise HTTPException(
            400,
            "未配置该模型的 API Key，请在模型配置中保存密钥（密钥仅存于服务端）",
        )

    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    base = _resolve_chat_url(req.provider, req.base_url)

    try:
        content = await chat_completion(
            messages,
            model=req.model,
            provider=req.provider,
            api_key=api_key,
            base_url=base or None,
            temperature=req.temperature,
        )
        return {"content": content}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/chat/stream")
async def agent_chat_stream(req: AgentChatRequest, user_id: str = Depends(get_current_user)):
    if req.provider not in (None, "tencent") and req.provider not in OPENAI_COMPATIBLE_PROVIDERS:
        raise HTTPException(400, f"不支持的服务商: {req.provider}")

    api_key = resolve_model_api_key(user_id, req.model_config_id)
    if not api_key:
        raise HTTPException(
            400,
            "未配置该模型的 API Key，请在模型配置中保存密钥（密钥仅存于服务端）",
        )

    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    base = _resolve_chat_url(req.provider, req.base_url)

    async def event_stream():
        try:
            async for event in stream_chat_completion(
                messages,
                model=req.model,
                provider=req.provider,
                api_key=api_key,
                base_url=base or None,
                temperature=req.temperature,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/image")
async def agent_image(req: ImageGenRequest, user_id: str = Depends(get_current_user)):
    provider = (req.provider or "").strip()
    if provider and provider not in supported_image_providers() and provider != "tencent":
        raise HTTPException(400, f"暂不支持该图片服务商: {provider}")

    api_key = resolve_model_api_key(user_id, req.model_config_id)
    if not api_key and provider != "tencent":
        raise HTTPException(
            400,
            "未配置该模型的 API Key，请在模型配置中保存密钥（密钥仅存于服务端）",
        )

    try:
        result = await generate_image(
            req.prompt,
            model=req.model,
            provider=req.provider,
            api_key=api_key,
            base_url=req.base_url,
            aspect_ratio=req.aspect_ratio,
            resolution=req.resolution,
            width=req.width,
            height=req.height,
            image_url=req.image_url,
            user_id=user_id,
        )
        return result
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/video")
async def agent_video_create(req: VideoGenRequest, user_id: str = Depends(get_current_user)):
    provider = (req.provider or "").strip()
    if provider and provider not in supported_video_providers() and provider != "tencent":
        raise HTTPException(400, f"暂不支持该视频服务商: {provider}")

    api_key = resolve_model_api_key(user_id, req.model_config_id)
    if not api_key and provider != "tencent":
        raise HTTPException(
            400,
            "未配置该模型的 API Key，请在模型配置中保存密钥（密钥仅存于服务端）",
        )

    try:
        return await create_video_task(
            req.prompt,
            model=req.model,
            provider=req.provider,
            api_key=api_key,
            base_url=req.base_url,
            aspect_ratio=req.aspect_ratio,
            resolution=req.resolution,
            image_base64=req.image_base64,
            duration=req.duration,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/video/query")
async def agent_video_query(req: VideoTaskQuery, user_id: str = Depends(get_current_user)):
    api_key = resolve_model_api_key(user_id, req.model_config_id)
    if not api_key:
        raise HTTPException(
            400,
            "未配置该模型的 API Key，请在模型配置中保存密钥（密钥仅存于服务端）",
        )
    try:
        return await query_video_task(
            req.job_id,
            provider=req.provider,
            api_key=api_key,
            base_url=req.base_url,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


MAX_CHAT_EXTRACT_BYTES = 20 * 1024 * 1024
MAX_CHAT_EXTRACT_CHARS = 50_000


@router.post("/files/extract")
async def extract_chat_file(
    file: UploadFile = File(...),
    _user_id: str = Depends(get_current_user),
):
    """从对话附件（PDF / Word / Excel 等）提取纯文本，供 LLM 分析。"""
    filename = file.filename or "unknown"
    suffix = Path(filename).suffix.lower()
    if not is_allowed_suffix(suffix):
        raise HTTPException(400, detail=f"不支持的文件格式: {suffix or '(无扩展名)'}")

    data = await file.read()
    if len(data) > MAX_CHAT_EXTRACT_BYTES:
        raise HTTPException(400, detail="文件过大，单文件最大 20MB")

    text, note = extract_text(filename, data)
    if text:
        text = normalize_text_content(filename, text)[:MAX_CHAT_EXTRACT_CHARS]

    return {
        "filename": filename,
        "text": text,
        "note": note,
    }
