import { platformAuthHeaders } from '../utils/authHeaders'
import { parseApiError } from '../utils/parseApiError'

export interface ChatMessagePayload {
  role: string
  content: string
}

export type ChatStreamEventType = 'content' | 'thinking'

export interface ChatStreamOptions {
  messages: ChatMessagePayload[]
  model?: string
  provider?: string
  baseUrl?: string
  modelConfigId?: string
  temperature?: number
  signal?: AbortSignal
  onDelta: (text: string) => void
  /** DeepSeek Reasoner 等模型的推理流 */
  onThinkingDelta?: (text: string) => void
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
        const json = JSON.parse(payload) as {
          delta?: string
          type?: ChatStreamEventType
          error?: string
        }
        if (json.error) throw new Error(json.error)
        const kind = json.type ?? 'content'
        const piece = json.delta
        if (!piece) continue
        if (kind === 'thinking') {
          opts.onThinkingDelta?.(piece)
        } else {
          full += piece
          opts.onDelta(piece)
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
  resolution?: string
  width?: number
  height?: number
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
      resolution: params.resolution,
      width: params.width,
      height: params.height,
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
  baseUrl?: string
  aspectRatio?: string
  resolution?: string
  duration?: number
  width?: number
  height?: number
}): Promise<{ url?: string; jobId?: string; status?: string; message: string }> {
  const res = await fetch('/api/platform/agent/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...platformAuthHeaders() },
    body: JSON.stringify({
      prompt: params.prompt,
      image_base64: params.imageBase64,
      model: params.model,
      provider: params.provider,
      model_config_id: params.modelConfigId,
      base_url: params.baseUrl,
      aspect_ratio: params.aspectRatio,
      resolution: params.resolution,
      duration: params.duration,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseApiError(data, '视频生成失败'))
  return {
    url: data.url,
    jobId: data.jobId,
    status: data.status,
    message: data.message || '视频任务已提交',
  }
}

export async function queryVideoTask(params: {
  jobId: string
  modelConfigId?: string
  provider?: string
  baseUrl?: string
}): Promise<{ status: string; url?: string; message?: string }> {
  const res = await fetch('/api/platform/agent/video/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...platformAuthHeaders() },
    body: JSON.stringify({
      job_id: params.jobId,
      model_config_id: params.modelConfigId,
      provider: params.provider,
      base_url: params.baseUrl,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(parseApiError(data, '查询视频任务失败'))
  return data
}

const VIDEO_FAIL_STATUSES = new Set(['failed', 'expired', 'cancelled', 'canceled', 'error'])

export async function pollVideoTask(
  params: {
    jobId: string
    modelConfigId?: string
    provider?: string
    baseUrl?: string
  },
  opts?: { intervalMs?: number; maxWaitMs?: number },
): Promise<{ url: string; status: string }> {
  const intervalMs = opts?.intervalMs ?? 4000
  const maxWaitMs = opts?.maxWaitMs ?? 10 * 60 * 1000
  const deadline = Date.now() + maxWaitMs

  while (Date.now() < deadline) {
    const result = await queryVideoTask(params)
    const status = (result.status || '').toLowerCase()
    if (status === 'succeeded' && result.url) {
      return { url: result.url, status }
    }
    if (VIDEO_FAIL_STATUSES.has(status)) {
      throw new Error(result.message || '视频生成失败')
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('视频生成超时，请稍后在创作历史中重试')
}

export async function checkHealth() {
  const res = await fetch('/api/health')
  return res.json()
}

export interface ExtractFileTextResult {
  filename: string
  text: string | null
  note: string
}

/** 从 PDF / Word / Excel 等附件提取纯文本（服务端 pymupdf / python-docx） */
export async function extractFileText(file: File): Promise<ExtractFileTextResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/platform/agent/files/extract', {
    method: 'POST',
    headers: platformAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(parseApiError(err, '文件解析失败'))
  }
  return res.json()
}
