import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 120000 })

export interface ChatMessagePayload {
  role: string
  content: string
}

export async function sendChat(params: {
  messages: ChatMessagePayload[]
  model?: string
  provider?: string
  baseUrl?: string
  apiKey?: string
  temperature?: number
}): Promise<string> {
  const { data } = await api.post<{ content: string }>('/chat', params)
  return data.content
}

export interface ChatStreamOptions {
  messages: ChatMessagePayload[]
  model?: string
  provider?: string
  baseUrl?: string
  apiKey?: string
  temperature?: number
  signal?: AbortSignal
  onDelta: (text: string) => void
}

/** SSE 流式对话（DeepSeek / OpenAI 兼容） */
export async function sendChatStream(opts: ChatStreamOptions): Promise<string> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: opts.messages,
      model: opts.model,
      provider: opts.provider,
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      temperature: opts.temperature,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || '流式请求失败')
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

export async function generateImage(params: {
  prompt: string
  model?: string
  provider?: string
  apiKey?: string
  baseUrl?: string
  aspectRatio?: string
}): Promise<{ url?: string; message: string }> {
  const { data } = await api.post('/image', params)
  return data
}

export async function generateVideo(params: {
  prompt: string
  imageBase64?: string
  model?: string
  provider?: string
  apiKey?: string
}): Promise<{ url?: string; jobId?: string; status?: string; message: string }> {
  const { data } = await api.post('/video', params)
  return data
}

export async function checkHealth() {
  const { data } = await api.get('/health')
  return data
}
