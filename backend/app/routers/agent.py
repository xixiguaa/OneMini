import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.deps import get_user_id
from app.services.llm import (
    PROVIDER_BASE_URLS,
    chat_completion,
    stream_chat_completion,
)
from app.services.secrets_store import resolve_model_api_key

router = APIRouter(prefix="/agent", tags=["agent"])

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


def _resolve_chat_url(provider: str | None, base_url: str | None) -> str:
    url = (base_url or "").strip()
    if not url and provider:
        url = PROVIDER_BASE_URLS.get(provider, "")
    return url.rstrip("/")


@router.post("/chat")
async def agent_chat(req: AgentChatRequest, user_id: str = Depends(get_user_id)):
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
async def agent_chat_stream(req: AgentChatRequest, user_id: str = Depends(get_user_id)):
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
