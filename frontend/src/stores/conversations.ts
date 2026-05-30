import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createConversationApi,
  deleteConversationApi,
  fetchConversations,
  importConversationsApi,
  replaceConversationMessages,
} from '../api/conversations'
import type { ChatMessage, Conversation } from '../types/agent'
import { groupConversations } from '../utils/conversationTimeGroup'
import { randomUUID } from '../utils/uuid'

const LEGACY_STORAGE_KEY = 'aji-conversations'
const PERSIST_DEBOUNCE_MS = 600
const TITLE_MAX_LEN = 28

/** 侧栏对话历史：仅含文字问答 / Agent 交互，排除纯图片视频会话 */
export function isChatConversation(conv: Conversation): boolean {
  if (conv.messages.length === 0) return true
  return conv.messages.some(
    (m) => m.type === 'text' || m.type === 'error' || m.skillId === 'chat',
  )
}

/** 从首条用户消息生成侧栏标题（过长省略） */
export function deriveConversationTitle(
  messages: ChatMessage[],
  maxLen = TITLE_MAX_LEN,
): string {
  const first = messages.find((m) => m.role === 'user' && m.content.replace(/\n/g, ' ').trim())
  if (!first) return '新对话'
  const t = first.content.replace(/\n/g, ' ').trim()
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
}

function loadLegacyConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Conversation[]
  } catch {
    /* ignore */
  }
  return []
}

function clearLegacyStorage() {
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}

export const useConversationsStore = defineStore('conversations', () => {
  const list = ref<Conversation[]>([])
  const activeId = ref<string | null>(null)
  const loading = ref(false)
  const hydrated = ref(false)
  const persistError = ref<string | null>(null)

  const incognitoActive = ref(false)
  const incognitoMessages = ref<ChatMessage[]>([])

  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** 流式生成期间暂停防抖写入，结束后统一 flush，避免同一条消息触发两次 PUT */
  const persistPaused = ref(false)

  const isIncognito = computed(() => incognitoActive.value)

  const activeConversation = computed(() =>
    incognitoActive.value ? null : list.value.find((c) => c.id === activeId.value) ?? null,
  )

  const sortedList = computed(() =>
    [...list.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  const chatList = computed(() => sortedList.value.filter(isChatConversation))

  const groupedList = computed(() => groupConversations(chatList.value))

  function setPersistPaused(paused: boolean) {
    persistPaused.value = paused
    if (paused) {
      for (const [id, timer] of persistTimers) {
        clearTimeout(timer)
        persistTimers.delete(id)
      }
    }
  }

  function schedulePersist(conversationId: string) {
    if (incognitoActive.value || persistPaused.value) return
    const existing = persistTimers.get(conversationId)
    if (existing) clearTimeout(existing)
    persistTimers.set(
      conversationId,
      setTimeout(() => {
        persistTimers.delete(conversationId)
        void flushPersist(conversationId)
      }, PERSIST_DEBOUNCE_MS),
    )
  }

  async function flushPersist(conversationId: string) {
    const conv = list.value.find((c) => c.id === conversationId)
    if (!conv) return
    const messages = conv.messages
    try {
      persistError.value = null
      const saved = await replaceConversationMessages(conversationId, messages)
      // 删除后可能仍有在途写入，避免把已删会话写回服务端
      const live = list.value.find((c) => c.id === conversationId)
      if (!live) return
      const localTitle = deriveConversationTitle(messages)
      live.title = localTitle !== '新对话' ? localTitle : saved.title || live.title
      live.updatedAt = saved.updatedAt
    } catch (e) {
      persistError.value = e instanceof Error ? e.message : '保存对话失败'
      console.error('[conversations] persist', e)
    }
  }

  async function hydrate(): Promise<void> {
    if (hydrated.value) return
    loading.value = true
    persistError.value = null
    try {
      let conversations = await fetchConversations(true)
      const legacy = loadLegacyConversations()
      if (legacy.length > 0) {
        if (conversations.length === 0) {
          await importConversationsApi(legacy)
          conversations = await fetchConversations(true)
        }
        // 服务端已有数据时仅丢弃旧 localStorage，避免刷新后重复导入
        clearLegacyStorage()
      }
      list.value = conversations
      activeId.value = conversations[0]?.id ?? null
      hydrated.value = true
    } catch (e) {
      persistError.value = e instanceof Error ? e.message : '加载对话失败'
      console.error('[conversations] hydrate', e)
    } finally {
      loading.value = false
      hydrated.value = true
    }
  }

  /** 进入空白草稿：仅展示输入区，发送首条消息后再创建会话 */
  function startDraftSession() {
    exitIncognito()
    activeId.value = null
  }

  function startIncognito() {
    incognitoActive.value = true
    incognitoMessages.value = []
  }

  function exitIncognito() {
    incognitoActive.value = false
    incognitoMessages.value = []
  }

  function getIncognitoMessages(): ChatMessage[] {
    return incognitoMessages.value
  }

  function setIncognitoMessages(messages: ChatMessage[]) {
    incognitoMessages.value = messages
  }

  /** 保证已 hydrate 且存在可写入的会话（发消息前 await） */
  async function ensureMessagingSession(): Promise<void> {
    if (incognitoActive.value) return
    if (!hydrated.value) await hydrate()
    const hasActive =
      activeId.value != null && list.value.some((c) => c.id === activeId.value)
    if (hasActive) return
    if (persistError.value) {
      createConversationLocal()
      return
    }
    try {
      await createConversation()
    } catch (e) {
      persistError.value = e instanceof Error ? e.message : '创建对话失败'
      createConversationLocal()
    }
  }

  async function createConversation(): Promise<Conversation> {
    exitIncognito()
    const created = await createConversationApi()
    const conv: Conversation = {
      id: created.id,
      title: created.title,
      messages: [],
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    }
    list.value.unshift(conv)
    activeId.value = conv.id
    return conv
  }

  function selectConversation(id: string) {
    exitIncognito()
    if (list.value.some((c) => c.id === id)) activeId.value = id
  }

  function getMessages(id: string): ChatMessage[] {
    return list.value.find((c) => c.id === id)?.messages ?? []
  }

  function setMessages(id: string, messages: ChatMessage[]) {
    const conv = list.value.find((c) => c.id === id)
    if (!conv) return
    conv.messages = messages
    conv.updatedAt = Date.now()
    const derived = deriveConversationTitle(messages)
    if (derived !== '新对话') conv.title = derived
    schedulePersist(id)
  }

  /** 发送首问后立即更新侧栏标题（不等待持久化） */
  function updateTitleFromText(id: string, text: string) {
    const conv = list.value.find((c) => c.id === id)
    if (!conv) return
    const t = text.replace(/\n/g, ' ').trim()
    if (!t) return
    conv.title = t.length > TITLE_MAX_LEN ? `${t.slice(0, TITLE_MAX_LEN)}…` : t
    conv.updatedAt = Date.now()
  }

  async function deleteConversation(id: string) {
    const timer = persistTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      persistTimers.delete(id)
    }
    try {
      await deleteConversationApi(id)
    } catch (e) {
      const is404 = axios.isAxiosError(e) && e.response?.status === 404
      if (!is404) {
        console.error('[conversations] delete', e)
        persistError.value = e instanceof Error ? e.message : '删除对话失败'
        throw e
      }
    }
    list.value = list.value.filter((c) => c.id !== id)
    if (activeId.value === id) {
      activeId.value = list.value[0]?.id ?? null
    }
    if (list.value.length === 0) {
      activeId.value = null
    }
  }

  function ensureActive(): string | null {
    const chats = list.value.filter(isChatConversation)
    if (chats.length === 0) {
      activeId.value = null
      return null
    }
    if (!activeId.value || !chats.some((c) => c.id === activeId.value)) {
      activeId.value = chats[0].id
    }
    return activeId.value
  }

  /** 同步创建占位会话（hydrate 失败时的降级） */
  function createConversationLocal(): Conversation {
    exitIncognito()
    const conv: Conversation = {
      id: randomUUID(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    list.value.unshift(conv)
    activeId.value = conv.id
    return conv
  }

  return {
    list,
    activeId,
    activeConversation,
    sortedList,
    chatList,
    groupedList,
    loading,
    hydrated,
    persistError,
    isIncognito,
    incognitoActive,
    hydrate,
    startIncognito,
    exitIncognito,
    getIncognitoMessages,
    setIncognitoMessages,
    createConversation,
    createConversationLocal,
    selectConversation,
    getMessages,
    setMessages,
    updateTitleFromText,
    deriveConversationTitle,
    deleteConversation,
    startDraftSession,
    ensureActive,
    ensureMessagingSession,
    setPersistPaused,
    flushPersist,
  }
})
