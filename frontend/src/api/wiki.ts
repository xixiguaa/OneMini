import axios from 'axios'
import { getClientUserId } from '../utils/userId'

const api = axios.create({ baseURL: '/api/platform', timeout: 120000 })
api.interceptors.request.use((config) => {
  config.headers.set('X-User-Id', getClientUserId())
  return config
})

export interface WikiRawFile {
  path: string
  name: string
  size: number
  suffix: string
  kind: 'text' | 'pdf' | 'word' | 'excel'
  extracted: boolean
  /** 是否已完成 LLM 结构化（有 published 来源摘要） */
  ingested?: boolean
}

export interface WikiGraphNode {
  id: string
  title: string
  type: string
  path: string
  kind?: string
  file_exists?: boolean
  orphan?: boolean
}

export interface WikiGraphEdge {
  source: string
  target: string
  type: string
}

export interface WikiGraph {
  version: number
  generated_at: string | null
  nodes: WikiGraphNode[]
  edges: WikiGraphEdge[]
}

export interface WikiStatus {
  ok: boolean
  wiki_root: string
  raw_count: number
  nodes: number
  edges: number
  allowed_suffixes?: string[]
  pending_ingest?: number
  orphan_wiki?: number
  ingest_job?: {
    running: boolean
    total: number
    done: number
    current: string | null
    errors: { raw?: string; error: string }[]
  }
}

export interface WikiIngestConflict {
  id: string
  raw: string
  wiki_path: string
  title: string
  similarity: number
  created_at?: string
  existing_preview?: string
  proposed_preview?: string
}

export type WikiConflictResolution = 'overwrite' | 'discard' | 'keep_both'

export interface WikiIngestStatus {
  running: boolean
  total: number
  done: number
  current: string | null
  errors: { raw?: string; error: string; kind?: string; conflict_id?: string }[]
  results: {
    raw: string
    ok: boolean
    partial?: boolean
    pages?: string[]
    count?: number
    conflicts?: { conflict_id?: string; path?: string }[]
  }[]
  pending_count: number
  pending_paths?: string[]
  conflict_count?: number
  conflicts?: WikiIngestConflict[]
  started_at?: string | null
  finished_at?: string | null
  mode?: string
  cancel_requested?: boolean
  cancelled?: boolean
}

export interface WikiRebuildResult {
  started?: boolean
  message?: string
  pending_count?: number
  running?: boolean
  total?: number
  done?: number
  ok?: boolean
  nodes?: number
  edges?: number
}

export interface WikiNodeContent {
  id: string
  path: string
  title: string
  content: string
  source: 'file' | 'extract' | 'binary' | 'unsupported'
  note: string
}

/** 知识图谱页面上传 raw 支持的扩展名 */
export const WIKI_RAW_ACCEPT =
  '.md,.markdown,.txt,.csv,.json,.html,.htm,.pdf,.docx,.xlsx,.xlsm,.xls'

export async function getWikiStatus() {
  const { data } = await api.get<WikiStatus>('/wiki/status')
  return data
}

export async function getWikiGraph() {
  const { data } = await api.get<WikiGraph>('/wiki/graph')
  return data
}

export async function getWikiNodeContent(id: string) {
  const { data } = await api.get<WikiNodeContent>('/wiki/node', { params: { id } })
  return data
}

export async function getWikiIngestStatus() {
  const { data } = await api.get<WikiIngestStatus>('/wiki/ingest/status')
  return data
}

/** 构建知识框架：默认先 LLM ingest 未处理 raw，再重建图谱（后台队列） */
export async function rebuildWikiGraph(
  autoIngest = true,
  options?: { retryFailedOnly?: boolean },
) {
  const { data } = await api.post<WikiRebuildResult>('/wiki/graph/rebuild', {
    auto_ingest: autoIngest,
    retry_failed_only: options?.retryFailedOnly ?? false,
  })
  return data
}

export async function dismissWikiIngestErrors() {
  const { data } = await api.post<{ ok: boolean }>('/wiki/ingest/dismiss')
  return data
}

/** 停止进行中的构建；已完成项保留，当前未完成项回滚 */
export async function cancelWikiIngest() {
  const { data } = await api.post<{
    cancelled: boolean
    message: string
    rolled_back?: string[]
    pending_count?: number
  }>('/wiki/ingest/cancel')
  return data
}

export async function listWikiIngestConflicts() {
  const { data } = await api.get<{ count: number; conflicts: WikiIngestConflict[] }>(
    '/wiki/ingest/conflicts',
  )
  return data
}

export async function resolveWikiIngestConflict(
  conflictId: string,
  resolution: WikiConflictResolution,
) {
  const { data } = await api.post<{ ok: boolean; action?: string; alt_path?: string }>(
    '/wiki/ingest/conflicts/resolve',
    { conflict_id: conflictId, resolution },
  )
  return data
}

export async function repairUnknownWikiNodes() {
  const { data } = await api.post<WikiRebuildResult>('/wiki/graph/repair-unknown')
  return data
}

export async function listWikiRawFiles() {
  const { data } = await api.get<{ files: WikiRawFile[] }>('/wiki/raw')
  return data.files
}

export async function uploadWikiRawFile(file: File, subdir = 'uploads') {
  const form = new FormData()
  form.append('file', file)
  form.append('subdir', subdir)
  const { data } = await api.post<{
    ok: boolean
    path: string
    extract_path?: string | null
    extraction_note?: string
    source_page: string
    graph: { nodes: number; edges: number }
  }>('/wiki/raw/upload', form, { timeout: 300000 })
  return data
}

export async function deleteWikiRawFile(path: string) {
  await api.delete('/wiki/raw', { params: { path } })
}

export interface WikiQueryContext {
  id: string
  title: string
  type: string
  path: string
  score: number
  text: string
}

export interface WikiLintIssue {
  kind: string
  severity: 'error' | 'warn' | 'info'
  page: string
  message: string
}

export interface WikiLintResult {
  ok: boolean
  summary: {
    issues: number
    errors: number
    warnings: number
    orphans: number
    pending_raw: number
  }
  issues: WikiLintIssue[]
}

export async function runWikiLint() {
  const { data } = await api.post<WikiLintResult>('/wiki/lint')
  return data
}

export interface WikiQueryStreamOptions {
  question: string
  messages?: { role: string; content: string }[]
  systemExtra?: string
  model?: string
  provider?: string
  modelConfigId?: string
  baseUrl?: string
  topK?: number
  signal?: AbortSignal
  onContexts?: (contexts: WikiQueryContext[]) => void
  onDelta: (text: string) => void
}

/** LLM-Wiki 流式查询（对话 LLM-Wiki 模式） */
export async function sendWikiChatStream(opts: WikiQueryStreamOptions): Promise<string> {
  const res = await fetch('/api/platform/wiki/query/stream', {
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
    throw new Error(err.detail || err.error || 'LLM-Wiki 查询失败')
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
          contexts?: WikiQueryContext[]
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
