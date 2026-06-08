from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from mcp.types import Tool

TOOL_NAME_SEP = "__"


@dataclass(frozen=True)
class RegisteredMcpTool:
    server_id: str
    tool: Tool
    qualified_name: str


def qualify_tool_name(server_id: str, tool_name: str) -> str:
    return f"{server_id}{TOOL_NAME_SEP}{tool_name}"


def split_qualified_tool_name(qualified_name: str) -> tuple[str, str]:
    if TOOL_NAME_SEP not in qualified_name:
        raise ValueError(f"无效 MCP 工具名: {qualified_name}")
    server_id, tool_name = qualified_name.split(TOOL_NAME_SEP, 1)
    if not server_id or not tool_name:
        raise ValueError(f"无效 MCP 工具名: {qualified_name}")
    return server_id, tool_name


def mcp_tool_to_openai(tool: RegisteredMcpTool) -> dict[str, Any]:
    schema = tool.tool.inputSchema or {"type": "object", "properties": {}}
    description = (tool.tool.description or tool.tool.title or tool.qualified_name).strip()
    return {
        "type": "function",
        "function": {
            "name": tool.qualified_name,
            "description": description,
            "parameters": schema,
        },
    }


def registered_tool_to_dict(tool: RegisteredMcpTool) -> dict[str, Any]:
    return {
        "server_id": tool.server_id,
        "name": tool.tool.name,
        "qualified_name": tool.qualified_name,
        "description": tool.tool.description or "",
        "input_schema": tool.tool.inputSchema or {},
    }
