import axios from 'axios'
import { getClientUserId } from '../utils/userId'

const api = axios.create({ baseURL: '/api/platform', timeout: 120000 })
api.interceptors.request.use((config) => {
  config.headers.set('X-User-Id', getClientUserId())
  return config
})

export interface KnowledgeDocument {
  doc_id: string
  source: string
  chunks: number
  created_at: number
}

export interface RagContext {
  id: string
  score: number
  doc_id: string
  chunk_index: number
  source: string
  text: string
}

export async function checkPlatformHealth() {
  const { data } = await api.get('/health')
  return data as {
    ok: boolean
    milvus: { ok: boolean; version?: string; error?: string }
    llm_configured: boolean
  }
}

export async function listKnowledgeDocuments() {
  const { data } = await api.get<{ documents: KnowledgeDocument[] }>('/knowledge/documents')
  return data.documents
}

export async function addKnowledgeText(text: string, source: string) {
  const form = new FormData()
  form.append('text', text)
  form.append('source', source)
  const { data } = await api.post<{ ok: boolean; doc_id: string; chunks: number }>(
    '/knowledge/documents',
    form,
  )
  return data
}

export async function uploadKnowledgeFile(file: File, source?: string) {
  const form = new FormData()
  form.append('file', file)
  if (source) form.append('source', source)
  const { data } = await api.post<{ ok: boolean; doc_id: string; chunks: number }>(
    '/knowledge/documents/upload',
    form,
  )
  return data
}

export async function deleteKnowledgeDocument(docId: string) {
  await api.delete(`/knowledge/documents/${docId}`)
}

export interface RagStreamOptions {
  question: string
  messages?: { role: string; content: string }[]
  /** 追加到 RAG system 提示（如实际调用模型说明） */
  systemExtra?: string
  model?: string
  provider?: string
  modelConfigId?: string
  baseUrl?: string
  topK?: number
  signal?: AbortSignal
  onContexts?: (contexts: RagContext[]) => void
  onDelta: (text: string) => void
}

/** RAG 流式对话：先返回 contexts，再流式 delta */
export async function sendRagChatStream(opts: RagStreamOptions): Promise<string> {
  const res = await fetch('/api/platform/chat/rag/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getClientUserId(),
    },
    body: JSON.stringify({
      question: opts.question,
      messages: opts.messages ?? [],
      system_extra: opts.systemExtra,
      model: opts.model,
      provider: opts.provider,
      model_config_id: opts.modelConfigId,
      base_url: opts.baseUrl,
      top_k: opts.topK,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || err.error || 'RAG 请求失败')
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
          type?: string
          delta?: string
          contexts?: RagContext[]
          error?: string
        }
        if (json.type === 'contexts' && json.contexts) {
          opts.onContexts?.(json.contexts)
        }
        if (json.type === 'delta' && json.delta) {
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
