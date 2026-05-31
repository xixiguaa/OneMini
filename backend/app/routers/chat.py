import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.deps import get_current_user
from app.services import rag

router = APIRouter(
    prefix="/chat",
    tags=["chat"],
    dependencies=[Depends(get_current_user)],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class RagChatRequest(BaseModel):
    question: str
    messages: list[ChatMessage] = Field(default_factory=list)
    top_k: int | None = None
    model: str | None = None
    provider: str | None = None
    system_extra: str | None = None
    model_config_id: str | None = None
    base_url: str | None = None


@router.post("/rag")
async def rag_chat(req: RagChatRequest, user_id: str = Depends(get_current_user)):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "缺少 question")

    history = [{"role": m.role, "content": m.content} for m in req.messages]
    try:
        result = await rag.rag_answer(
            question,
            history=history,
            top_k=req.top_k,
            model=req.model,
            provider=req.provider,
            system_extra=req.system_extra,
            model_config_id=req.model_config_id,
            user_id=user_id,
            base_url=req.base_url,
        )
        return result
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


@router.post("/rag/stream")
async def rag_chat_stream(req: RagChatRequest, user_id: str = Depends(get_current_user)):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "缺少 question")

    history = [{"role": m.role, "content": m.content} for m in req.messages]

    try:
        contexts, token_gen = await rag.rag_answer_stream(
            question,
            history=history,
            top_k=req.top_k,
            model=req.model,
            provider=req.provider,
            system_extra=req.system_extra,
            model_config_id=req.model_config_id,
            user_id=user_id,
            base_url=req.base_url,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc

    async def event_stream():
        meta = {"type": "contexts", "contexts": contexts}
        yield f"data: {json.dumps(meta, ensure_ascii=False)}\n\n"
        async for delta in token_gen:
            yield f"data: {json.dumps({'type': 'delta', 'delta': delta}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
