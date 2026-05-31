import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services.image_gen import generate_image, supported_image_providers
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
    image_url: str | None = None


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
            async for delta in stream_chat_completion(
                messages,
                model=req.model,
                provider=req.provider,
                api_key=api_key,
                base_url=base or None,
                temperature=req.temperature,
            ):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
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
            image_url=req.image_url,
            user_id=user_id,
        )
        return result
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc
