import { platformAuthHeaders } from '../utils/authHeaders'
import { parseApiError } from '../utils/parseApiError'

export interface ChatMessagePayload {
  role: string
  content: string
}

export interface ChatStreamOptions {
  messages: ChatMessagePayload[]
  model?: string
  provider?: string
  baseUrl?: string
  modelConfigId?: string
  temperature?: number
  signal?: AbortSignal
  onDelta: (text: string) => void
}

/** SSE 流式对话（密钥由服务端按 modelConfigId 解析，不在请求体传输） */
export async function sendChatStream(opts: ChatStreamOptions): Promise<string> {
  const res = await fetch('/api/platform/agent/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...platformAuthHeaders(),
    },
    body: JSON.stringify({
      messages: opts.messages,
      model: opts.model,
      provider: opts.provider,
      base_url: opts.baseUrl,
      model_config_id: opts.modelConfigId,
      temperature: opts.temperature,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || err.error || '流式请求失败')
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('浏览器不支持流式响应')

  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as { delta?: string; error?: string }
        if (json.error) throw new Error(json.error)
        if (json.delta) {
          full += json.delta
          opts.onDelta(json.delta)
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }

  return full
}

export async function sendChat(params: {
  messages: ChatMessagePayload[]
  model?: string
  provider?: string
  baseUrl?: string
  modelConfigId?: string
  temperature?: number
}): Promise<string> {
  const res = await fetch('/api/platform/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...platformAuthHeaders(),
    },
    body: JSON.stringify({
      messages: params.messages,
      model: params.model,
      provider: params.provider,
      base_url: params.baseUrl,
      model_config_id: params.modelConfigId,
      temperature: params.temperature,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || err.error || '请求失败')
  }
  const data = (await res.json()) as { content: string }
  return data.content
}

export async function generateImage(params: {
  prompt: string
  model?: string
  provider?: string
  modelConfigId?: string
  baseUrl?: string
  aspectRatio?: string
  imageUrl?: string
}): Promise<{ url?: string; message: string }> {
  const res = await fetch('/api/platform/agent/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...platformAuthHeaders() },
    body: JSON.stringify({
      prompt: params.prompt,
      model: params.model,
      provider: params.provider,
      model_config_id: params.modelConfigId,
      base_url: params.baseUrl,
      aspect_ratio: params.aspectRatio,
      image_url: params.imageUrl,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseApiError(data, '图片生成失败'))
  return data
}

export async function generateVideo(params: {
  prompt: string
  imageBase64?: string
  model?: string
  provider?: string
  modelConfigId?: string
  aspectRatio?: string
  resolution?: string
  width?: number
  height?: number
}): Promise<{ url?: string; jobId?: string; status?: string; message: string }> {
  const res = await fetch('/api/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...platformAuthHeaders() },
    body: JSON.stringify({
      prompt: params.prompt,
      imageBase64: params.imageBase64,
      model: params.model,
      provider: params.provider,
      model_config_id: params.modelConfigId,
      aspect_ratio: params.aspectRatio,
      resolution: params.resolution,
      width: params.width,
      height: params.height,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '视频生成失败')
  return data
}

export async function checkHealth() {
  const res = await fetch('/api/health')
  return res.json()
}
