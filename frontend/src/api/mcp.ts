import { platformAuthHeaders } from '../utils/authHeaders'
import { parseApiError } from '../utils/parseApiError'

export interface McpServerStatus {
  id: string
  transport: string
  tool_count: number
  tools: string[]
}

export interface McpStatusPayload {
  enabled: boolean
  connected: boolean
  servers: McpServerStatus[]
  failed: Record<string, string>
  tool_count: number
}

export interface McpToolPayload {
  server_id: string
  name: string
  qualified_name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface McpToolsResponse {
  enabled: boolean
  connected: boolean
  tools: McpToolPayload[]
}

async function mcpFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/platform/mcp${path}`, {
    headers: platformAuthHeaders(),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(parseApiError(data, 'MCP 请求失败'))
  }
  return res.json() as Promise<T>
}

export function fetchMcpStatus() {
  return mcpFetch<McpStatusPayload>('/status')
}

export function fetchMcpTools() {
  return mcpFetch<McpToolsResponse>('/tools')
}
