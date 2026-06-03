import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  deleteCreateSessionApi,
  deleteCreateVersionApi,
  fetchCreateHistory,
  patchCreateHistoryItem,
  syncCreateHistory,
  upsertCreateHistoryItem,
} from '../api/createHistory'
import type { Conversation } from '../types/agent'
import {
  createHistoryMediaUrl,
  resolveCreateHistoryImageUrl,
  withCreateHistoryMediaToken,
} from '../utils/createHistoryMedia'
import { randomUUID } from '../utils/uuid'

export interface CreateHistoryItem {
  id: string
  prompt: string
  type: 'image' | 'video'
  url?: string
  previewUrl?: string
  jobId?: string
  status: 'RUNNING' | 'DONE' | 'FAIL'
  modelId?: string
  modelName?: string
  createdAt: number
  /** 编辑链根会话 ID（首图 id） */
  sessionId?: string
  /** 上一版本 id */
  parentId?: string
  /** 生成时的宽高比，如 16:9 */
  aspectRatio?: string
  /** 编辑/生成操作类型，用于历史列表标签 */
  editAction?: string
  /** 生成时上传的参考图 URL（持久化后多为 /create-history/media/{id}-ref-N） */
  referenceUrls?: string[]
  /** 公共画廊发布者用户 ID */
  publishedBy?: string
  /** 发布标题 */
  title?: string
  /** 发布作品描述 */
  description?: string
}

const STORAGE_KEY = 'onemini-create-history-cache'
const LEGACY_STORAGE_KEY = 'onemini-create-history'
const MIGRATED_KEY = 'onemini-create-history-migrated'

function isMigrationDone(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    return false
  }
}

function markMigrationDone() {
  try {
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    /* ignore */
  }
}

function loadCache(): CreateHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return (JSON.parse(raw) as CreateHistoryItem[]).filter((i) => i.status !== 'FAIL')
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const items = JSON.parse(legacy) as CreateHistoryItem[]
      saveCache(items)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return items
    }
  } catch {
    /* ignore */
  }
  return []
}

function saveCache(items: CreateHistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.filter((i) => i.status !== 'FAIL')))
  } catch {
    /* ignore */
  }
}

async function purgeFailedRemote(failed: CreateHistoryItem[]) {
  for (const item of failed) {
    try {
      if (item.parentId) await deleteCreateVersionApi(item.id)
      else await deleteCreateSessionApi(item.sessionId || item.id)
    } catch (e) {
      const is404 = axios.isAxiosError(e) && e.response?.status === 404
      if (!is404) console.warn('[createHistory] purge failed item', e)
    }
  }
}

function findPromptForMedia(conv: Conversation, index: number, mediaType: 'image' | 'video'): string {
  for (let j = index - 1; j >= 0; j--) {
    const prev = conv.messages[j]
    if (prev.role !== 'user') continue
    if (prev.skillId === mediaType || prev.type === mediaType) {
      return prev.content.trim()
    }
  }
  for (let j = index - 1; j >= 0; j--) {
    const prev = conv.messages[j]
    if (prev.role === 'user') return prev.content.trim()
  }
  return '创作'
}

function normalizeItem(item: CreateHistoryItem): CreateHistoryItem {
  const url = resolveCreateHistoryImageUrl(item)
  if (!url || url === (item.url || item.previewUrl)) return item
  return { ...item, url, previewUrl: url }
}

export const useCreateHistoryStore = defineStore('createHistory', () => {
  const items = ref<CreateHistoryItem[]>(loadCache().map(normalizeItem))
  const hydrated = ref(false)
  const migrated = ref(false)
  let hydrateTask: Promise<void> | null = null

  const sortedItems = computed(() =>
    [...items.value]
      .filter((i) => i.status !== 'FAIL')
      .sort((a, b) => b.createdAt - a.createdAt),
  )

  function setItems(next: CreateHistoryItem[]) {
    items.value = next.map(normalizeItem)
    saveCache(items.value)
  }

  async function pullFromServer() {
    const remote = await fetchCreateHistory()
    const failed = remote.filter((i) => i.status === 'FAIL')
    setItems(remote.filter((i) => i.status !== 'FAIL'))
    if (failed.length) void purgeFailedRemote(failed)
    if (remote.length > 0) markMigrationDone()
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    hydrated.value = true
  }

  /** 进入创作页或应用启动时拉取服务端列表 */
  async function hydrate(force = false) {
    if (!force && hydrated.value) return
    if (hydrateTask) return hydrateTask
    hydrateTask = (async () => {
      try {
        await pullFromServer()
      } catch (err) {
        hydrated.value = false
        console.warn('[createHistory] hydrate failed, using cache', err)
        const cached = loadCache().map(normalizeItem)
        if (cached.length && items.value.length === 0) setItems(cached)
      } finally {
        hydrateTask = null
      }
    })()
    return hydrateTask
  }

  /** 进行中条目：仅本地展示，不写服务端 */
  function add(item: Omit<CreateHistoryItem, 'id' | 'createdAt'>) {
    const entry: CreateHistoryItem = {
      ...item,
      id: randomUUID(),
      createdAt: Date.now(),
    }
    items.value = [entry, ...items.value]
    saveCache(items.value)
    return entry
  }

  /** 生成成功：更新本地并首次写入服务端 */
  async function complete(id: string, patch: Partial<CreateHistoryItem>) {
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    Object.assign(item, patch)
    markMigrationDone()
    try {
      const saved = await upsertCreateHistoryItem({ ...item })
      const rawUrl = saved.previewUrl ?? saved.url
      const url = rawUrl ? withCreateHistoryMediaToken(rawUrl) : createHistoryMediaUrl(item.id)
      Object.assign(item, {
        url: url || rawUrl,
        previewUrl: url || rawUrl,
        referenceUrls: saved.referenceUrls ?? item.referenceUrls,
      })
      saveCache(items.value)
    } catch (err) {
      console.warn('[createHistory] complete failed', err)
      throw err
    }
  }

  /** 生成失败：从本地移除（未成功前从未写入服务端） */
  async function discard(id: string) {
    items.value = items.value.filter((i) => i.id !== id)
    saveCache(items.value)
  }

  function update(id: string, patch: Partial<CreateHistoryItem>) {
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    Object.assign(item, patch)
    saveCache(items.value)
    void patchCreateHistoryItem(id, patch).catch((err) => {
      console.warn('[createHistory] patch failed', err)
    })
  }

  function belongsToSession(item: CreateHistoryItem, sessionId: string) {
    return item.sessionId === sessionId || item.id === sessionId
  }

  async function removeSession(sessionId: string) {
    try {
      await deleteCreateSessionApi(sessionId)
    } catch (e) {
      const is404 = axios.isAxiosError(e) && e.response?.status === 404
      if (!is404) throw e
    }
    items.value = items.value.filter((i) => !belongsToSession(i, sessionId))
    saveCache(items.value)
    markMigrationDone()
  }

  function isVersionLeaf(id: string) {
    return !items.value.some((i) => i.parentId === id)
  }

  function versionSubtreeIds(rootId: string, pool = items.value): string[] {
    const byId = new Set(pool.map((item) => item.id))
    if (!byId.has(rootId)) return []
    const order: string[] = []
    const walk = (id: string) => {
      pool.filter((item) => item.parentId === id).forEach((child) => walk(child.id))
      order.push(id)
    }
    walk(rootId)
    return order
  }

  async function removeVersion(id: string) {
    if (!isVersionLeaf(id)) return false
    try {
      await deleteCreateVersionApi(id)
    } catch (e) {
      const is404 = axios.isAxiosError(e) && e.response?.status === 404
      if (!is404) throw e
    }
    items.value = items.value.filter((i) => i.id !== id)
    saveCache(items.value)
    return true
  }

  async function removeVersionCascade(id: string) {
    const order = versionSubtreeIds(id)
    if (!order.length) return false
    try {
      await deleteCreateVersionApi(id, { cascade: true })
    } catch (e) {
      const is404 = axios.isAxiosError(e) && e.response?.status === 404
      if (!is404) throw e
    }
    const removeSet = new Set(order)
    items.value = items.value.filter((item) => !removeSet.has(item.id))
    saveCache(items.value)
    return true
  }

  function sessionIdOf(item: CreateHistoryItem) {
    return item.sessionId || item.id
  }

  async function migrateFromConversations(conversations: Conversation[]) {
    if (migrated.value || isMigrationDone() || items.value.length > 0) return
    migrated.value = true

    const migratedItems: CreateHistoryItem[] = []
    for (const conv of conversations) {
      for (let i = 0; i < conv.messages.length; i++) {
        const msg = conv.messages[i]
        if (msg.role !== 'assistant') continue
        if (msg.type !== 'image' && msg.type !== 'video') continue
        const url = msg.attachments?.url || msg.attachments?.previewUrl
        if (!url) continue
        if (url.includes('picsum.photos')) continue

        const prompt = findPromptForMedia(conv, i, msg.type)

        migratedItems.push({
          id: msg.id,
          prompt: prompt || '创作',
          type: msg.type,
          url,
          previewUrl: msg.attachments?.previewUrl || url,
          jobId: msg.attachments?.jobId,
          status: 'DONE',
          createdAt: msg.timestamp || conv.updatedAt,
        })
      }
    }

    markMigrationDone()
    if (migratedItems.length) {
      setItems(migratedItems.sort((a, b) => b.createdAt - a.createdAt))
      try {
        await syncCreateHistory(items.value)
      } catch (err) {
        console.warn('[createHistory] migration sync failed', err)
      }
    }
  }

  function sessionItems(sessionId: string) {
    return sortedItems.value
      .filter((i) => i.sessionId === sessionId || i.id === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  return {
    items,
    sortedItems,
    hydrated,
    hydrate,
    add,
    complete,
    discard,
    update,
    removeSession,
    removeVersion,
    removeVersionCascade,
    isVersionLeaf,
    versionSubtreeIds,
    sessionIdOf,
    migrateFromConversations,
    sessionItems,
  }
})
