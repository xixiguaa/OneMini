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
import { randomUUID } from '../utils/uuid'

const LEGACY_STORAGE_KEY = 'aji-conversations'
const PERSIST_DEBOUNCE_MS = 600

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

  const isIncognito = computed(() => incognitoActive.value)

  const activeConversation = computed(() =>
    incognitoActive.value ? null : list.value.find((c) => c.id === activeId.value) ?? null,
  )

  const sortedList = computed(() =>
    [...list.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  function schedulePersist(conversationId: string) {
    if (incognitoActive.value) return
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
    try {
      persistError.value = null
      const saved = await replaceConversationMessages(conversationId, conv.messages)
      conv.title = saved.title
      conv.updatedAt = saved.updatedAt
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
      if (legacy.length > 0 && conversations.length === 0) {
        await importConversationsApi(legacy)
        clearLegacyStorage()
        conversations = await fetchConversations(true)
      }
      list.value = conversations
      activeId.value = conversations[0]?.id ?? null
      hydrated.value = true
    } catch (e) {
      persistError.value = e instanceof Error ? e.message : '加载对话失败'
      const legacy = loadLegacyConversations()
      if (legacy.length > 0) {
        list.value = legacy
        activeId.value = legacy[0]?.id ?? null
      }
      console.error('[conversations] hydrate', e)
    } finally {
      loading.value = false
    }
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

  function ensureMessagingSession(): void {
    if (incognitoActive.value) return
    ensureActive()
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
    const first = messages.find((m) => m.role === 'user')
    if (first) {
      const t = first.content.replace(/\n/g, ' ').trim()
      conv.title = t.length > 24 ? `${t.slice(0, 24)}…` : t || conv.title
    }
    schedulePersist(id)
  }

  async function deleteConversation(id: string) {
    try {
      await deleteConversationApi(id)
    } catch (e) {
      console.error('[conversations] delete', e)
    }
    list.value = list.value.filter((c) => c.id !== id)
    if (activeId.value === id) {
      activeId.value = list.value[0]?.id ?? null
    }
    const timer = persistTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      persistTimers.delete(id)
    }
  }

  function ensureActive(): string {
    if (!activeId.value || !list.value.some((c) => c.id === activeId.value)) {
      if (list.value.length === 0) {
        throw new Error('会话尚未加载，请先调用 hydrate()')
      }
      activeId.value = list.value[0].id
    }
    return activeId.value!
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
    deleteConversation,
    ensureActive,
    ensureMessagingSession,
    flushPersist,
  }
})
