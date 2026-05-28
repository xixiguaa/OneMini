import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import Settings, get_settings

# OpenAI 兼容族服务商默认 Base URL（与 frontend/server/index.js 对齐）
PROVIDER_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "zhipu": "https://open.bigmodel.cn/api/paas/v4",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "bailian": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "doubao": "https://ark.cn-beijing.volces.com/api/v3",
    "bytedance": "https://ark.cn-beijing.volces.com/api/v3",
    "minimax": "https://api.minimax.chat/v1",
    "yuanbao": "https://api.openai.com/v1",
    "gemini": "https://api.openai.com/v1",
    "grok": "https://api.openai.com/v1",
    "meta": "https://api.openai.com/v1",
    "kling": "https://api.openai.com/v1",
    "nanobanana": "https://api.openai.com/v1",
    "custom": "https://api.openai.com/v1",
}


def resolve_llm_endpoint(
    *,
    provider: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    settings: Settings | None = None,
) -> tuple[str, str]:
    settings = settings or get_settings()
    url = (base_url or "").strip()
    if not url and provider:
        url = PROVIDER_BASE_URLS.get(provider, "")
    if not url:
        url = settings.openai_base_url
    key = (api_key or "").strip() or settings.openai_api_key
    return url.rstrip("/"), key


RAG_SYSTEM = """你是 OneMini 智能助手。请根据下方「参考资料」回答用户问题。
规则：
1. 优先使用参考资料中的事实；资料不足时说明不确定，可结合常识简要补充。
2. 回答使用简体中文，条理清晰。
3. 若参考资料与问题无关，直接按常识回答并说明未命中知识库。"""


def build_rag_messages(
    question: str,
    contexts: list[dict[str, Any]],
    history: list[dict[str, str]] | None = None,
    *,
    system_extra: str | None = None,
) -> list[dict[str, str]]:
    blocks = []
    for i, ctx in enumerate(contexts, 1):
        src = ctx.get("source") or "未知来源"
        text = ctx.get("text") or ""
        score = ctx.get("score")
        blocks.append(f"[{i}] 来源: {src} (相关度 {score:.3f})\n{text}")

    context_block = "\n\n".join(blocks) if blocks else "（无匹配片段）"
    user_content = f"参考资料：\n{context_block}\n\n用户问题：{question}"

    system_content = RAG_SYSTEM
    if system_extra and system_extra.strip():
        system_content = f"{RAG_SYSTEM}\n\n{system_extra.strip()}"
    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
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
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.3,
    timeout: float = 120.0,
    response_format: dict[str, str] | None = None,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    resolved_base, key = resolve_llm_endpoint(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
        settings=settings,
    )
    if not key:
        last_user = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"),
            "",
        )
        return (
            "【演示模式】未配置 OPENAI_API_KEY，无法调用大模型。\n\n"
            f"已收到问题片段：「{last_user[:200]}…」\n"
            "请在「模型配置」填写对应服务商 API Key，或在 backend/.env 配置 OPENAI_API_KEY。"
        )

    url = resolved_base + "/chat/completions"
    payload: dict[str, Any] = {
        "model": model or settings.chat_model,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=timeout) as client:
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
        choice = data.get("choices") or []
        if not choice:
            raise RuntimeError("模型未返回 choices（可能被限流或请求超时）")
        content = choice[0].get("message", {}).get("content")
        return (content or "").strip()


async def stream_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.3,
    settings: Settings | None = None,
) -> AsyncIterator[str]:
    settings = settings or get_settings()
    resolved_base, key = resolve_llm_endpoint(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
        settings=settings,
    )

    if not key:
        text = await chat_completion(
            messages,
            model=model,
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            settings=settings,
        )
        yield text
        return

    url = resolved_base + "/chat/completions"
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
