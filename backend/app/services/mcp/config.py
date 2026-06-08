from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class McpServerConfig(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    transport: Literal["stdio"] = "stdio"
    command: str = Field(min_length=1)
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] | None = None
    cwd: str | None = None
    enabled: bool = True

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        cleaned = value.strip()
        if "__" in cleaned:
            raise ValueError("MCP server id 不能包含 '__'")
        return cleaned


def parse_mcp_servers(raw: str) -> list[McpServerConfig]:
    text = (raw or "[]").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []

    servers: list[McpServerConfig] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        try:
            servers.append(McpServerConfig.model_validate(item))
        except Exception:
            continue
    return servers


def resolve_server_cwd(cwd: str | None) -> str | None:
    if not cwd:
        return None
    path = Path(cwd).expanduser()
    if not path.is_absolute():
        backend_root = Path(__file__).resolve().parents[3]
        path = backend_root / path
    resolved = path.resolve()
    return str(resolved) if resolved.exists() else str(path)


def merge_process_env(extra: dict[str, str] | None) -> dict[str, str] | None:
    if not extra:
        return None
    import os

    merged = os.environ.copy()
    merged.update(extra)
    return merged
