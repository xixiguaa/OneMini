from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.config import Settings, get_settings
from app.services.llm import chat_completion_round, stream_chat_completion_round
from app.services.mcp.client_manager import McpClientManager, get_mcp_manager


def _new_tool_call_id() -> str:
    return f"call_{uuid.uuid4().hex[:24]}"


def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role")
        if role not in ("system", "user", "assistant", "tool"):
            continue
        normalized: dict[str, Any] = {"role": role}
        if "content" in msg:
            normalized["content"] = msg.get("content")
        if msg.get("tool_calls"):
            normalized["tool_calls"] = msg["tool_calls"]
        if msg.get("tool_call_id"):
            normalized["tool_call_id"] = msg["tool_call_id"]
        if msg.get("name"):
            normalized["name"] = msg["name"]
        out.append(normalized)
    return out


async def run_agent_with_mcp_tools(
    messages: list[dict[str, Any]],
    *,
    manager: McpClientManager | None = None,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.2,
    thinking_enabled: bool | None = None,
    reasoning_effort: str | None = None,
    max_tool_rounds: int | None = None,
    settings: Settings | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    settings = settings or get_settings()
    manager = manager or get_mcp_manager()
    tools = manager.list_openai_tools()
    if not tools:
        raise RuntimeError("MCP 未连接任何工具，请检查 MCP_ENABLED 与 MCP_SERVERS 配置")

    rounds = max_tool_rounds or settings.mcp_max_tool_rounds
    working = _normalize_messages(messages)
    tool_records: list[dict[str, Any]] = []

    for _ in range(max(1, rounds)):
        assistant = await chat_completion_round(
            working,
            tools=tools,
            model=model,
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            temperature=temperature,
            thinking_enabled=thinking_enabled,
            reasoning_effort=reasoning_effort,
            settings=settings,
        )
        tool_calls = assistant.get("tool_calls") or []
        content = (assistant.get("content") or "").strip()
        if not tool_calls:
            return content, tool_records

        working.append(
            {
                "role": "assistant",
                "content": assistant.get("content"),
                "tool_calls": tool_calls,
            }
        )

        for call in tool_calls:
            fn = call.get("function") or {}
            qualified_name = fn.get("name") or ""
            raw_args = fn.get("arguments") or "{}"
            call_id = call.get("id") or _new_tool_call_id()
            record: dict[str, Any] = {
                "id": call_id,
                "name": qualified_name,
                "status": "running",
            }
            tool_records.append(record)

            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args or {})
                if not isinstance(args, dict):
                    raise ValueError("工具参数必须是 JSON 对象")
                result_text = await manager.call_tool(
                    qualified_name,
                    args,
                    timeout_sec=settings.mcp_tool_call_timeout_sec,
                )
                record["status"] = "done"
                record["summary"] = result_text[:240]
            except Exception as exc:
                result_text = f"[tool error] {exc}"
                record["status"] = "error"
                record["summary"] = str(exc)[:240]

            working.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": result_text,
                }
            )

    last_assistant = next(
        (m for m in reversed(working) if m.get("role") == "assistant"),
        None,
    )
    fallback = (last_assistant or {}).get("content") or ""
    return (
        fallback
        or "已达到 MCP 工具调用轮次上限，请简化问题后重试。",
        tool_records,
    )


async def stream_agent_with_mcp_tools(
    messages: list[dict[str, Any]],
    *,
    manager: McpClientManager | None = None,
    model: str | None = None,
    provider: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    temperature: float = 0.2,
    thinking_enabled: bool | None = None,
    reasoning_effort: str | None = None,
    max_tool_rounds: int | None = None,
    settings: Settings | None = None,
) -> AsyncIterator[dict[str, Any]]:
    settings = settings or get_settings()
    manager = manager or get_mcp_manager()
    tools = manager.list_openai_tools()
    if not tools:
        yield {"type": "error", "message": "MCP 未连接任何工具，请检查 MCP_ENABLED 与 MCP_SERVERS 配置"}
        return

    rounds = max_tool_rounds or settings.mcp_max_tool_rounds
    working = _normalize_messages(messages)

    for _ in range(max(1, rounds)):
        assistant: dict[str, Any] = {"role": "assistant", "content": ""}
        async for event in stream_chat_completion_round(
            working,
            tools=tools,
            model=model,
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            temperature=temperature,
            thinking_enabled=thinking_enabled,
            reasoning_effort=reasoning_effort,
            settings=settings,
        ):
            if event.get("type") == "assistant":
                assistant = event.get("message") or assistant
                continue
            yield event

        tool_calls = assistant.get("tool_calls") or []
        if not tool_calls:
            return

        working.append(
            {
                "role": "assistant",
                "content": assistant.get("content"),
                "tool_calls": tool_calls,
            }
        )

        for call in tool_calls:
            fn = call.get("function") or {}
            qualified_name = fn.get("name") or ""
            raw_args = fn.get("arguments") or "{}"
            call_id = call.get("id") or _new_tool_call_id()
            yield {
                "type": "tool_start",
                "tool": {"id": call_id, "name": qualified_name, "status": "running"},
            }

            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args or {})
                if not isinstance(args, dict):
                    raise ValueError("工具参数必须是 JSON 对象")
                result_text = await manager.call_tool(
                    qualified_name,
                    args,
                    timeout_sec=settings.mcp_tool_call_timeout_sec,
                )
                status = "done"
            except Exception as exc:
                result_text = f"[tool error] {exc}"
                status = "error"

            working.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": result_text,
                }
            )
            yield {
                "type": "tool_done",
                "tool": {
                    "id": call_id,
                    "name": qualified_name,
                    "status": status,
                    "summary": result_text[:240],
                },
            }

    yield {
        "type": "content",
        "delta": "已达到 MCP 工具调用轮次上限，请简化问题后重试。",
    }
