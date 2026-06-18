from __future__ import annotations

import json
import uuid
import io
from collections.abc import AsyncIterator
from typing import Any

from app.config import Settings, get_settings
from app.services.llm import chat_completion_round, stream_chat_completion_round
from app.services.mcp.client_manager import McpClientManager, get_mcp_manager
from app.services import minio_storage

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

def _resolve_all_tools(
    enabled_skills: list[str] | None,
    user_id: str | None,
    manager: McpClientManager
) -> list[dict[str, Any]]:
    tools = []
    try:
        tools = manager.list_openai_tools()
    except Exception:
        pass
    
    if not enabled_skills:
        return tools
        
    # Add built-in tools
    if "web-search" in enabled_skills:
        tools.append({
            "type": "function",
            "function": {
                "name": "local__search_web",
                "description": "Search the web for up-to-date information matching the query",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The search query"}
                    },
                    "required": ["query"]
                }
            }
        })
    if "knowledge-rag" in enabled_skills:
        tools.append({
            "type": "function",
            "function": {
                "name": "local__search_knowledge",
                "description": "Search user's local RAG knowledge base for relevant context matching the query",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search keyword query"}
                    },
                    "required": ["query"]
                }
            }
        })
    if "knowledge-wiki" in enabled_skills:
        tools.append({
            "type": "function",
            "function": {
                "name": "local__search_wiki",
                "description": "Query structural LLM-Wiki knowledge base nodes and relationships",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "description": "The question to ask"}
                    },
                    "required": ["question"]
                }
            }
        })

    # Add custom uploaded tools
    from app.services import custom_skills_service
    from app.db.session import get_session
    from app.db.models import AgentSkillRow
    
    try:
        with get_session() as db:
            active = custom_skills_service.get_active_skills(db)
            for skill in active:
                if skill.id not in enabled_skills:
                    continue
                try:
                    import zipfile
                    zip_data = minio_storage.get_bytes(skill.minio_key)
                    if zip_data:
                        with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
                            files = z.namelist()
                            skill_md_path = None
                            for f in files:
                                if f == "SKILL.md" or (f.endswith("/SKILL.md") and f.count("/") == 1):
                                    skill_md_path = f
                                    break
                            if not skill_md_path:
                                raise ValueError("ZIP 压缩包中缺少 SKILL.md 元数据文件")
                            content = z.read(skill_md_path).decode("utf-8")
                            from app.services.custom_skills_service import parse_frontmatter
                            meta = parse_frontmatter(content)
                            for tool_def in meta.get("tools", []):
                                prefixed_name = f"custom__{skill.id}__{tool_def['name']}"
                                tools.append({
                                    "type": "function",
                                    "function": {
                                        "name": prefixed_name,
                                        "description": tool_def.get("description", ""),
                                        "parameters": tool_def.get("parameters", {"type": "object", "properties": {}})
                                    }
                                })
                except Exception as e:
                    print(f"[WARN] 无法加载自定义技能 {skill.id} 声明: {e}")
    except Exception as e:
        print(f"[WARN] 获取自定义技能元数据失败: {e}")
                
    return tools

async def _execute_tool_dispatch(
    qualified_name: str,
    args: dict,
    user_id: str | None,
    manager: McpClientManager,
    settings: Settings
) -> str:
    if qualified_name.startswith("custom__"):
        parts = qualified_name.split("__")
        skill_id = parts[1]
        tool_name = parts[2]
        
        from app.services import custom_skills_service
        from app.db.session import get_session
        from app.db.models import AgentSkillRow
        
        with get_session() as db:
            row = db.query(AgentSkillRow).filter(AgentSkillRow.id == skill_id).first()
            if not row:
                raise ValueError(f"数据库中未找到技能 {skill_id}")
            minio_key = row.minio_key
            
        return await custom_skills_service.run_custom_tool(skill_id, minio_key, tool_name, args)
        
    elif qualified_name == "local__search_web":
        from app.services.web_search import search_web
        results = await search_web(args.get("query", ""))
        return json.dumps(results, ensure_ascii=False)
        
    elif qualified_name == "local__search_knowledge":
        from app.services.milvus_store import search_similar
        hits = search_similar(args.get("query", ""), user_id=user_id or "")
        return json.dumps(hits, ensure_ascii=False)
        
    elif qualified_name == "local__search_wiki":
        from app.services import wiki_query
        res = await wiki_query.wiki_answer(args.get("question", ""), user_id=user_id or "")
        return res.get("answer", "")
        
    else:
        return await manager.call_tool(
            qualified_name,
            args,
            timeout_sec=settings.mcp_tool_call_timeout_sec,
        )

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
    enabled_skills: list[str] | None = None,
    user_id: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    settings = settings or get_settings()
    manager = manager or get_mcp_manager()
    tools = _resolve_all_tools(enabled_skills, user_id, manager)
    if not tools:
        # If no tools are available or enabled, complete normally
        assistant = await chat_completion_round(
            _normalize_messages(messages),
            tools=None,
            model=model,
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            temperature=temperature,
            thinking_enabled=thinking_enabled,
            reasoning_effort=reasoning_effort,
            settings=settings,
        )
        return (assistant.get("content") or "").strip(), []

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
                result_text = await _execute_tool_dispatch(
                    qualified_name,
                    args,
                    user_id,
                    manager,
                    settings,
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
        or "已达到智能体工具调用轮次上限，请简化问题后重试。",
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
    enabled_skills: list[str] | None = None,
    user_id: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    settings = settings or get_settings()
    manager = manager or get_mcp_manager()
    tools = _resolve_all_tools(enabled_skills, user_id, manager)
    if not tools:
        # Yield normal chat completion stream
        async for event in stream_chat_completion_round(
            _normalize_messages(messages),
            tools=None,
            model=model,
            provider=provider,
            api_key=api_key,
            base_url=base_url,
            temperature=temperature,
            thinking_enabled=thinking_enabled,
            reasoning_effort=reasoning_effort,
            settings=settings,
        ):
            yield event
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
                result_text = await _execute_tool_dispatch(
                    qualified_name,
                    args,
                    user_id,
                    manager,
                    settings,
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
        "delta": "已达到智能体工具调用轮次上限，请简化问题后重试。",
    }
