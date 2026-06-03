import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createConversationApi,
  deleteConversationApi,
  fetchConversations,
  importConversationsApi,
  patchMessageFeedbackApi,
  replaceConversationMessages,
} from '../api/conversations'
import type { ChatMessage, Conversation, MessageFeedback, WorkingMemoryState } from '../types/agent'
import {
  buildBranchTimeline,
  normalizeToGraph,
  resolveDefaultLeaf,
} from '../services/conversationGraph'
import { repairAssistantMessage } from '../utils/deepThinking'
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
  const incognitoActiveLeafId = ref<string | null>(null)
  const incognitoWorkingMemory = ref<WorkingMemoryState | undefined>(undefined)

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
      await ensureConversationOnServer(conversationId)
      const saved = await replaceConversationMessages(conversationId, messages, {
        activeLeafId: conv.activeLeafId,
        workingMemory: conv.workingMemory,
      })
      // 删除后可能仍有在途写入，避免把已删会话写回服务端
      const live = list.value.find((c) => c.id === conversationId)
      if (!live) return
      const localTitle = deriveConversationTitle(messages)
      live.title = localTitle !== '新对话' ? localTitle : saved.title || live.title
      live.updatedAt = saved.updatedAt
      if (saved.activeLeafId) live.activeLeafId = saved.activeLeafId
      if (saved.workingMemory) live.workingMemory = saved.workingMemory
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
      list.value = conversations.map((c) => ensureConversationGraphFields({ ...c, serverSynced: true }))
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

  function ensureConversationGraphFields(conv: Conversation): Conversation {
    const messages = normalizeToGraph(conv.messages ?? []).map((m) =>
      m.role === 'assistant' ? repairAssistantMessage(m) : m,
    )
    const leaf = conv.activeLeafId ?? resolveDefaultLeaf(messages)?.id ?? null
    return { ...conv, messages, activeLeafId: leaf }
  }

  function startIncognito() {
    incognitoActive.value = true
    incognitoMessages.value = []
    incognitoActiveLeafId.value = null
    incognitoWorkingMemory.value = undefined
  }

  function exitIncognito() {
    incognitoActive.value = false
    incognitoMessages.value = []
    incognitoActiveLeafId.value = null
    incognitoWorkingMemory.value = undefined
  }

  function getIncognitoMessages(): ChatMessage[] {
    return incognitoMessages.value
  }

  function setIncognitoMessages(messages: ChatMessage[]) {
    incognitoMessages.value = messages
  }

  /** 同步占位会话，保证发消息时可立即写入 UI */
  function ensureLocalSession(): void {
    if (incognitoActive.value) return
    if (activeId.value && list.value.some((c) => c.id === activeId.value)) return
    createConversationLocal()
  }

  async function ensureConversationOnServer(conversationId: string): Promise<void> {
    if (incognitoActive.value || persistError.value) return
    const conv = list.value.find((c) => c.id === conversationId)
    if (!conv || conv.serverSynced !== false) return
    try {
      await createConversationApi({ id: conv.id, title: conv.title })
      conv.serverSynced = true
    } catch {
      /* flushPersist 或下次发送再试 */
    }
  }

  async function syncActiveConversation(): Promise<void> {
    const id = activeId.value
    if (!id) return
    await ensureConversationOnServer(id)
  }

  /** 保证已 hydrate 且存在可写入的会话（发消息前 await） */
  async function ensureMessagingSession(): Promise<void> {
    if (incognitoActive.value) return
    if (!hydrated.value) await hydrate()
    ensureLocalSession()
    await syncActiveConversation()
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
      serverSynced: true,
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
    conv.messages = normalizeToGraph(messages)
    if (!conv.activeLeafId || !conv.messages.some((m) => m.id === conv.activeLeafId)) {
      conv.activeLeafId = resolveDefaultLeaf(conv.messages)?.id ?? null
    }
    conv.updatedAt = Date.now()
    const derived = deriveConversationTitle(buildBranchTimeline(conv.messages, conv.activeLeafId ?? null).path)
    if (derived !== '新对话') conv.title = derived
    schedulePersist(id)
  }

  function getActiveLeafId(id: string): string | null {
    if (incognitoActive.value) return incognitoActiveLeafId.value
    return list.value.find((c) => c.id === id)?.activeLeafId ?? null
  }

  function setActiveLeafId(conversationId: string, leafId: string | null) {
    if (incognitoActive.value) {
      incognitoActiveLeafId.value = leafId
      return
    }
    const conv = list.value.find((c) => c.id === conversationId)
    if (!conv) return
    conv.activeLeafId = leafId
    conv.updatedAt = Date.now()
    schedulePersist(conversationId)
  }

  function getWorkingMemory(id: string): WorkingMemoryState | undefined {
    if (incognitoActive.value) return incognitoWorkingMemory.value
    return list.value.find((c) => c.id === id)?.workingMemory
  }

  function setWorkingMemory(conversationId: string, state: WorkingMemoryState | undefined) {
    if (incognitoActive.value) {
      incognitoWorkingMemory.value = state
      return
    }
    const conv = list.value.find((c) => c.id === conversationId)
    if (!conv) return
    conv.workingMemory = state
  }

  type MessagePatch = Omit<Partial<ChatMessage>, 'feedback'> & { feedback?: MessageFeedback | null }

  function patchMessageLocal(
    conversationId: string,
    messageId: string,
    patch: MessagePatch,
  ) {
    const conv = list.value.find((c) => c.id === conversationId)
    if (!conv) return null
    const idx = conv.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return null
    const prev = conv.messages[idx]
    const { feedback, ...rest } = patch
    const next: ChatMessage = { ...prev, ...rest }
    if ('feedback' in patch) {
      if (feedback) next.feedback = feedback
      else delete next.feedback
    }
    conv.messages[idx] = next
    conv.updatedAt = Date.now()
    return prev
  }

  async function updateMessageFeedback(
    conversationId: string,
    messageId: string,
    feedback: MessageFeedback | null,
  ) {
    const prev = patchMessageLocal(conversationId, messageId, { feedback })
    if (!prev) return
    try {
      persistError.value = null
      const saved = await patchMessageFeedbackApi(conversationId, messageId, feedback)
      patchMessageLocal(conversationId, messageId, { feedback: saved.feedback ?? null })
    } catch (e) {
      patchMessageLocal(conversationId, messageId, { feedback: prev.feedback ?? null })
      persistError.value = e instanceof Error ? e.message : '保存反馈失败'
      throw e
    }
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
      serverSynced: false,
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
    getActiveLeafId,
    setActiveLeafId,
    getWorkingMemory,
    setWorkingMemory,
    patchMessageLocal,
    updateMessageFeedback,
    updateTitleFromText,
    deriveConversationTitle,
    deleteConversation,
    startDraftSession,
    ensureActive,
    ensureLocalSession,
    syncActiveConversation,
    ensureMessagingSession,
    setPersistPaused,
    flushPersist,
  }
})
