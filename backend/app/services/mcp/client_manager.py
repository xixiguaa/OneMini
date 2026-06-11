from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import CallToolResult, Tool

from app.config import Settings, get_settings
from app.services.mcp.config import (
    McpServerConfig,
    merge_process_env,
    parse_mcp_servers,
    resolve_server_cwd,
)
from app.services.mcp.registry import (
    RegisteredMcpTool,
    mcp_tool_to_openai,
    qualify_tool_name,
    registered_tool_to_dict,
    split_qualified_tool_name,
)


@dataclass
class McpServerState:
    config: McpServerConfig
    session: ClientSession
    tools: list[Tool] = field(default_factory=list)
    error: str | None = None


def format_tool_result(result: CallToolResult) -> str:
    parts: list[str] = []
    for block in result.content or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
            continue
        if isinstance(block, dict):
            if block.get("type") == "text" and block.get("text"):
                parts.append(str(block["text"]))
            else:
                parts.append(str(block))
        else:
            parts.append(str(block))

    body = "\n".join(parts).strip()
    if result.structuredContent is not None:
        body = body or str(result.structuredContent)
    if result.isError:
        return f"[tool error] {body or 'unknown error'}"
    return body or "(empty result)"


class McpClientManager:
    def __init__(self) -> None:
        self._exit_stack = AsyncExitStack()
        self._servers: dict[str, McpServerState] = {}
        self._failed: dict[str, str] = {}
        self._started = False
        self._lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self._servers)

    def list_registered_tools(self) -> list[RegisteredMcpTool]:
        out: list[RegisteredMcpTool] = []
        for server_id, state in self._servers.items():
            for tool in state.tools:
                out.append(
                    RegisteredMcpTool(
                        server_id=server_id,
                        tool=tool,
                        qualified_name=qualify_tool_name(server_id, tool.name),
                    )
                )
        return out

    def list_openai_tools(self) -> list[dict[str, Any]]:
        return [mcp_tool_to_openai(tool) for tool in self.list_registered_tools()]

    def list_tools_payload(self) -> list[dict[str, Any]]:
        return [registered_tool_to_dict(tool) for tool in self.list_registered_tools()]

    async def start(self, settings: Settings | None = None) -> None:
        settings = settings or get_settings()
        if self._started:
            return

        async with self._lock:
            if self._started:
                return

            if not settings.mcp_enabled:
                self._started = True
                return

            servers = parse_mcp_servers(settings.mcp_servers)
            for cfg in servers:
                if not cfg.enabled:
                    continue
                try:
                    await self._connect_stdio(cfg)
                except Exception as exc:
                    self._failed[cfg.id] = str(exc)
                    print(f"[WARN] MCP Server `{cfg.id}` 连接失败: {exc}")

            if self._servers:
                tool_count = len(self.list_registered_tools())
                print(f"[OK] MCP 已连接 {len(self._servers)} 个 Server，共 {tool_count} 个工具")
            elif servers and not self._failed:
                print("[WARN] MCP 已启用但未连接任何 Server")
            elif self._failed:
                print(f"[WARN] MCP 全部连接失败: {self._failed}")

            self._started = True

    async def _connect_stdio(self, cfg: McpServerConfig) -> None:
        params = StdioServerParameters(
            command=cfg.command,
            args=cfg.args,
            env=merge_process_env(cfg.env),
            cwd=resolve_server_cwd(cfg.cwd),
        )
        read, write = await self._exit_stack.enter_async_context(stdio_client(params))
        session = await self._exit_stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        response = await session.list_tools()
        self._servers[cfg.id] = McpServerState(
            config=cfg,
            session=session,
            tools=list(response.tools or []),
        )

    async def stop(self) -> None:
        async with self._lock:
            await self._exit_stack.aclose()
            self._exit_stack = AsyncExitStack()
            self._servers.clear()
            self._failed.clear()
            self._started = False

    async def call_tool(
        self,
        qualified_name: str,
        arguments: dict[str, Any] | None = None,
        *,
        timeout_sec: float = 60.0,
    ) -> str:
        server_id, tool_name = split_qualified_tool_name(qualified_name)
        state = self._servers.get(server_id)
        if not state:
            raise RuntimeError(f"MCP Server 未连接: {server_id}")

        timeout = timedelta(seconds=max(1.0, timeout_sec))
        result = await state.session.call_tool(
            tool_name,
            arguments or {},
            read_timeout_seconds=timeout,
        )
        return format_tool_result(result)


_manager: McpClientManager | None = None


def get_mcp_manager() -> McpClientManager:
    global _manager
    if _manager is None:
        _manager = McpClientManager()
    return _manager


def mcp_status(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    manager = get_mcp_manager()
    return {
        "enabled": settings.mcp_enabled,
        "connected": manager.enabled,
        "servers": [
            {
                "id": server_id,
                "transport": state.config.transport,
                "tool_count": len(state.tools),
                "tools": [tool.name for tool in state.tools],
            }
            for server_id, state in manager._servers.items()
        ],
        "failed": dict(manager._failed),
        "tool_count": len(manager.list_registered_tools()),
    }
