import os
import json
import asyncio
from typing import Any, AsyncIterator
from pathlib import Path

from app.config import get_settings
from app.services.milvus_store import search_similar
from app.services.web_search import search_web

# Import SDK parts
try:
    from claude_agent_sdk import (
        ClaudeSDKClient,
        ClaudeAgentOptions,
        AssistantMessage,
        TextBlock,
        ThinkingBlock,
        ToolUseBlock,
        ResultMessage,
        UserMessage,
        StreamEvent,
        tool,
        create_sdk_mcp_server,
    )
except ImportError:
    pass


async def stream_claude_agent(
    messages: list[dict[str, Any]],
    claude_agent_config: dict[str, Any],
    enabled_skills: list[str],
    user_id: str,
    api_key: str,
    conversation_id: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    # 1. Resolve system prompt and last user prompt
    system_prompt = "You are a helpful agent."
    chat_history = []
    last_user_prompt = "Hello"

    for m in messages:
        if m.get("role") == "system":
            system_prompt = m.get("content") or system_prompt
        else:
            chat_history.append(m)

    # Get the last user message as the query prompt
    user_msgs = [m for m in chat_history if m.get("role") == "user"]
    if user_msgs:
        last_user_prompt = user_msgs[-1].get("content") or last_user_prompt

    # 2. Extract configuration
    cwd = claude_agent_config.get("cwd")
    if not cwd or not os.path.exists(cwd):
        # Default to project root directory
        cwd = str(Path(__file__).parent.parent.parent.parent.resolve())

    perm_mode = claude_agent_config.get("permission_mode", "interactive")
    # Map interactive/acceptEdits/notificationsOnly to SDK modes
    # PermissionMode = Literal[default, acceptEdits, plan, dontAsk, bypassPermissions]
    mapped_perm = "default"
    if perm_mode == "acceptEdits":
        mapped_perm = "acceptEdits"
    elif perm_mode == "notificationsOnly":
        mapped_perm = "plan"

    thinking_budget = claude_agent_config.get("thinking_budget", 2048)
    thinking_cfg = None
    if thinking_budget > 0:
        thinking_cfg = {
            "type": "enabled",
            "budget_tokens": thinking_budget,
            "display": "summarized",
        }
    else:
        thinking_cfg = {"type": "disabled"}

    # 3. Build custom tools based on enabled skills
    custom_tools = []
    allowed_tools = []

    if "knowledge-rag" in enabled_skills:
        @tool(
            name="search_knowledge",
            description="Search user's local RAG knowledge base for relevant context matching the query",
            input_schema={"query": str}
        )
        async def search_knowledge(args: dict[str, Any]) -> dict[str, Any]:
            query_str = args.get("query", "")
            try:
                hits = search_similar(query_str, user_id=user_id)
                if not hits:
                    return {"content": [{"type": "text", "text": "No matching knowledge found in the database."}]}
                formatted = []
                for i, h in enumerate(hits):
                    src = h.get("source", "unknown source")
                    txt = h.get("text", "")
                    formatted.append(f"[{i+1}] Source: {src}\nContent: {txt}\n---")
                return {"content": [{"type": "text", "text": "\n\n".join(formatted)}]}
            except Exception as e:
                return {"content": [{"type": "text", "text": f"Error searching knowledge: {str(e)}"}]}

        custom_tools.append(search_knowledge)
        allowed_tools.append("mcp__onemini_skills__search_knowledge")

    if "web-search" in enabled_skills:
        @tool(
            name="search_web",
            description="Search the web for up-to-date information matching the query",
            input_schema={"query": str}
        )
        async def search_web_tool(args: dict[str, Any]) -> dict[str, Any]:
            query_str = args.get("query", "")
            try:
                results = await search_web(query_str)
                if not results:
                    return {"content": [{"type": "text", "text": "No search results found."}]}
                formatted = []
                for i, r in enumerate(results):
                    title = r.get("title", "")
                    snippet = r.get("snippet", "")
                    url = r.get("url", "")
                    formatted.append(f"[{i+1}] Title: {title}\nURL: {url}\nSnippet: {snippet}\n---")
                return {"content": [{"type": "text", "text": "\n\n".join(formatted)}]}
            except Exception as e:
                return {"content": [{"type": "text", "text": f"Error searching the web: {str(e)}"}]}

        custom_tools.append(search_web_tool)
        allowed_tools.append("mcp__onemini_skills__search_web")

    if "knowledge-wiki" in enabled_skills:
        @tool(
            name="search_wiki",
            description="Query structural LLM-Wiki knowledge base nodes and relationships",
            input_schema={"question": str}
        )
        async def search_wiki_tool(args: dict[str, Any]) -> dict[str, Any]:
            question_str = args.get("question", "")
            try:
                from app.services import wiki_query
                res = await wiki_query.wiki_answer(question_str, user_id=user_id)
                ans = res.get("answer", "No wiki response")
                return {"content": [{"type": "text", "text": ans}]}
            except Exception as e:
                return {"content": [{"type": "text", "text": f"Error querying wiki: {str(e)}"}]}

        custom_tools.append(search_wiki_tool)
        allowed_tools.append("mcp__onemini_skills__search_wiki")

    # Construct SDK MCP Server configuration
    mcp_servers = {}
    if custom_tools:
        skills_server = create_sdk_mcp_server(
            name="onemini_skills",
            version="1.0.0",
            tools=custom_tools
        )
        mcp_servers["onemini_skills"] = skills_server

    # Set up default environment variables for Claude CLI
    env = os.environ.copy()
    if api_key and not api_key.lower().startswith("sk-dummy") and not api_key.lower().startswith("dummy"):
        env["ANTHROPIC_API_KEY"] = api_key
    if base_url:
        env["ANTHROPIC_BASE_URL"] = base_url

    # Initialize ClaudeAgentOptions
    # If conversation_id is supplied, resume it. Otherwise, create a new session.
    resume_id = conversation_id if conversation_id else None

    options = ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt,
        permission_mode=mapped_perm,
        cwd=cwd,
        thinking=thinking_cfg,
        mcp_servers=mcp_servers,
        allowed_tools=allowed_tools,
        resume=resume_id,
        env=env,
        include_partial_messages=True,  # Crucial for token-by-token streaming
    )

    # 5. Connect and query
    async with ClaudeSDKClient(options=options) as client:
        await client.connect()
        await client.query(last_user_prompt)

        async for message in client.receive_response():
            if isinstance(message, StreamEvent):
                # Extract partial message updates
                evt = message.event
                if evt.get("type") == "content_block_delta":
                    delta = evt.get("delta") or {}
                    dtype = delta.get("type")
                    if dtype == "text_delta":
                        yield {"type": "content", "delta": delta.get("text", "")}
                    elif dtype == "thinking_delta":
                        yield {"type": "thinking", "delta": delta.get("thinking", "")}

            elif isinstance(message, AssistantMessage):
                # Inspect assistant message for tool calls
                for block in message.content:
                    if isinstance(block, ToolUseBlock):
                        yield {
                            "type": "tool_start",
                            "tool": {
                                "id": block.id,
                                "name": block.name,
                                "status": "running"
                            }
                        }

            elif isinstance(message, UserMessage) and message.parent_tool_use_id:
                # Inspect tool completion results returned to the model
                summary = ""
                if message.tool_use_result:
                    summary = str(message.tool_use_result.get("content", ""))[:240]
                yield {
                    "type": "tool_done",
                    "tool": {
                        "id": message.parent_tool_use_id,
                        "name": "Tool",
                        "status": "done",
                        "summary": summary
                    }
                }
