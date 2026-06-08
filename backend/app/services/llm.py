import json
import re
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import Settings, get_settings

# OpenAI 兼容族服务商默认 Base URL（与 frontend/server/index.js 对齐）
# DeepSeek 思考模式：https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
_DEEPSEEK_V4_THINKING_MODEL = re.compile(
    r"deepseek-v4-(pro|flash)|^deepseek-(chat|reasoner)$",
    re.I,
)


def deepseek_supports_thinking_param(model: str | None) -> bool:
    mid = (model or "").strip().lower()
    if not mid:
        return False
    if "reasoner" in mid:
        return True
    return bool(_DEEPSEEK_V4_THINKING_MODEL.search(mid))


def apply_provider_thinking_options(
    payload: dict[str, Any],
    *,
    provider: str | None,
    model: str | None,
    thinking_enabled: bool | None,
    reasoning_effort: str | None = None,
) -> None:
    """仅 DeepSeek OpenAI 兼容接口支持 thinking / reasoning_effort 请求字段。"""
    if thinking_enabled is None or provider != "deepseek":
        return
    if not deepseek_supports_thinking_param(model):
        return
    if thinking_enabled:
        payload["thinking"] = {"type": "enabled"}
        effort = (reasoning_effort or "high").strip().lower()
        payload["reasoning_effort"] = effort if effort in ("high", "max") else "high"
        # 思考模式下 temperature 等参数不生效，见官方文档
        payload.pop("temperature", None)
    else:
        payload["thinking"] = {"type": "disabled"}


PROVIDER_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "zhipu": "https://open.bigmodel.cn/api/paas/v4",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "bailian": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "doubao": "https://ark.cn-beijing.volces.com/api/plan/v3",
    "bytedance": "https://ark.cn-beijing.volces.com/api/plan/v3",
    "minimax": "https://api.minimax.chat/v1",
    "moonshot": "https://api.moonshot.cn/v1",
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
        rerank_score = ctx.get("rerank_score")
        vector_score = ctx.get("vector_score")
        score = ctx.get("score")
        if rerank_score is not None and vector_score is not None:
            score_label = f"重排 {rerank_score:.3f} / 向量 {vector_score:.3f}"
        elif score is not None:
            score_label = f"相关度 {score:.3f}"
        else:
            score_label = "相关度 —"
        blocks.append(f"[{i}] 来源: {src} ({score_label})\n{text}")

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
    thinking_enabled: bool | None = None,
    reasoning_effort: str | None = None,
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
    apply_provider_thinking_options(
        payload,
        provider=provider,
        model=model,
        thinking_enabled=thinking_enabled,
        reasoning_effort=reasoning_effort,
    )

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
        msg = choice[0].get("message") or {}
        reasoning = (msg.get("reasoning_content") or msg.get("reasoning") or "").strip()
        content = (msg.get("content") or "").strip()
        if reasoning and content:
            return content
        return content or reasoning


def _parse_assistant_message(msg: dict[str, Any]) -> dict[str, Any]:
    assistant: dict[str, Any] = {"role": "assistant", "content": msg.get("content")}
    tool_calls = msg.get("tool_calls")
    if tool_calls:
        assistant["tool_calls"] = tool_calls
    return assistant


async def chat_completion_round(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.3,
    thinking_enabled: bool | None = None,
    reasoning_effort: str | None = None,
    timeout: float = 120.0,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | None = "auto",
    settings: Settings | None = None,
) -> dict[str, Any]:
    """单次 LLM 回合，返回 assistant 消息（可含 tool_calls）。"""
    settings = settings or get_settings()
    resolved_base, key = resolve_llm_endpoint(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
        settings=settings,
    )
    if not key:
        last_user = next(
            (m.get("content") for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        return {
            "role": "assistant",
            "content": (
                "【演示模式】未配置 API Key，无法调用大模型。\n\n"
                f"已收到问题片段：「{str(last_user)[:200]}…」"
            ),
        }

    url = resolved_base + "/chat/completions"
    payload: dict[str, Any] = {
        "model": model or settings.chat_model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        payload["tools"] = tools
        if tool_choice:
            payload["tool_choice"] = tool_choice
    apply_provider_thinking_options(
        payload,
        provider=provider,
        model=model,
        thinking_enabled=thinking_enabled,
        reasoning_effort=reasoning_effort,
    )

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
        msg = choice[0].get("message") or {}
        return _parse_assistant_message(msg)


def _merge_stream_tool_calls(
    acc: dict[int, dict[str, Any]],
    delta_calls: list[dict[str, Any]] | None,
) -> None:
    if not delta_calls:
        return
    for item in delta_calls:
        index = item.get("index", 0)
        current = acc.setdefault(
            index,
            {"id": "", "type": "function", "function": {"name": "", "arguments": ""}},
        )
        if item.get("id"):
            current["id"] = item["id"]
        if item.get("type"):
            current["type"] = item["type"]
        fn = item.get("function") or {}
        target_fn = current.setdefault("function", {"name": "", "arguments": ""})
        if fn.get("name"):
            target_fn["name"] = str(fn["name"])
        if fn.get("arguments"):
            target_fn["arguments"] = str(target_fn.get("arguments") or "") + str(fn["arguments"])


async def stream_chat_completion_round(
    messages: list[dict[str, Any]],
    *,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.3,
    thinking_enabled: bool | None = None,
    reasoning_effort: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | None = "auto",
    settings: Settings | None = None,
) -> AsyncIterator[dict[str, str | dict[str, Any]]]:
    """流式单轮 LLM；结束时产出 type=assistant 的完整消息。"""
    settings = settings or get_settings()
    resolved_base, key = resolve_llm_endpoint(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
        settings=settings,
    )

    if not key:
        text = (
            "【演示模式】未配置 API Key，无法调用大模型。"
        )
        yield {"type": "content", "delta": text}
        yield {"type": "assistant", "message": {"role": "assistant", "content": text}}
        return

    url = resolved_base + "/chat/completions"
    payload: dict[str, Any] = {
        "model": model or settings.chat_model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    if tools:
        payload["tools"] = tools
        if tool_choice:
            payload["tool_choice"] = tool_choice
    apply_provider_thinking_options(
        payload,
        provider=provider,
        model=model,
        thinking_enabled=thinking_enabled,
        reasoning_effort=reasoning_effort,
    )

    content_parts: list[str] = []
    tool_calls_acc: dict[int, dict[str, Any]] = {}

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
                    delta_obj = chunk["choices"][0].get("delta") or {}
                    reasoning = delta_obj.get("reasoning_content") or delta_obj.get("reasoning")
                    content = delta_obj.get("content")
                    if reasoning:
                        yield {"type": "thinking", "delta": reasoning}
                    if content:
                        content_parts.append(content)
                        yield {"type": "content", "delta": content}
                    _merge_stream_tool_calls(tool_calls_acc, delta_obj.get("tool_calls"))
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue

    assistant: dict[str, Any] = {
        "role": "assistant",
        "content": "".join(content_parts) or None,
    }
    if tool_calls_acc:
        assistant["tool_calls"] = [tool_calls_acc[i] for i in sorted(tool_calls_acc)]
    yield {"type": "assistant", "message": assistant}


async def stream_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.3,
    thinking_enabled: bool | None = None,
    reasoning_effort: str | None = None,
    settings: Settings | None = None,
) -> AsyncIterator[dict[str, str]]:
    """产出 SSE 事件：type=thinking|content, delta=文本片段"""
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
        yield {"type": "content", "delta": text}
        return

    url = resolved_base + "/chat/completions"
    payload: dict[str, Any] = {
        "model": model or settings.chat_model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    apply_provider_thinking_options(
        payload,
        provider=provider,
        model=model,
        thinking_enabled=thinking_enabled,
        reasoning_effort=reasoning_effort,
    )

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
                    delta_obj = chunk["choices"][0].get("delta") or {}
                    reasoning = delta_obj.get("reasoning_content") or delta_obj.get("reasoning")
                    content = delta_obj.get("content")
                    if reasoning:
                        yield {"type": "thinking", "delta": reasoning}
                    if content:
                        yield {"type": "content", "delta": content}
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
