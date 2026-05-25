import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import Settings, get_settings

RAG_SYSTEM = """你是 OneMini 智能助手。请根据下方「参考资料」回答用户问题。
规则：
1. 优先使用参考资料中的事实；资料不足时说明不确定，可结合常识简要补充。
2. 回答使用简体中文，条理清晰。
3. 若参考资料与问题无关，直接按常识回答并说明未命中知识库。"""


def build_rag_messages(
    question: str,
    contexts: list[dict[str, Any]],
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    blocks = []
    for i, ctx in enumerate(contexts, 1):
        src = ctx.get("source") or "未知来源"
        text = ctx.get("text") or ""
        score = ctx.get("score")
        blocks.append(f"[{i}] 来源: {src} (相关度 {score:.3f})\n{text}")

    context_block = "\n\n".join(blocks) if blocks else "（无匹配片段）"
    user_content = f"参考资料：\n{context_block}\n\n用户问题：{question}"

    messages: list[dict[str, str]] = [{"role": "system", "content": RAG_SYSTEM}]
    if history:
        for msg in history[-10:]:
            role = msg.get("role")
            content = msg.get("content")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_content})
    return messages


async def chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.3,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    key = api_key or settings.openai_api_key
    if not key:
        last_user = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            "",
        )
        return (
            "【演示模式】未配置 OPENAI_API_KEY，无法调用大模型。\n\n"
            f"已收到问题片段：「{last_user[:200]}…」\n"
            "请在 backend/.env 中配置 OPENAI_API_KEY 与 OPENAI_BASE_URL（支持 DeepSeek 等兼容接口）。"
        )

    url = (base_url or settings.openai_base_url).rstrip("/") + "/chat/completions"
    payload = {
        "model": model or settings.chat_model,
        "messages": messages,
        "temperature": temperature,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        data = resp.json()
        if resp.status_code >= 400:
            raise RuntimeError(data.get("error", {}).get("message", resp.text))
        return data["choices"][0]["message"]["content"]


async def stream_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.3,
    settings: Settings | None = None,
) -> AsyncIterator[str]:
    settings = settings or get_settings()
    key = api_key or settings.openai_api_key

    if not key:
        text = await chat_completion(messages, settings=settings)
        yield text
        return

    url = (base_url or settings.openai_base_url).rstrip("/") + "/chat/completions"
    payload = {
        "model": model or settings.chat_model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            url,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                try:
                    err = json.loads(body).get("error", {}).get("message", body.decode())
                except Exception:
                    err = body.decode()
                raise RuntimeError(err)

            async for line in resp.aiter_lines():
                trimmed = line.strip()
                if not trimmed.startswith("data:"):
                    continue
                payload_str = trimmed[5:].strip()
                if payload_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload_str)
                    delta = chunk["choices"][0]["delta"].get("content")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
