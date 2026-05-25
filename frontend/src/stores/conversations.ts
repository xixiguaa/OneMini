import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ChatMessage, Conversation } from '../types/agent'
import { randomUUID } from '../utils/uuid'

const STORAGE_KEY = 'aji-conversations'

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Conversation[]
  } catch {
    /* ignore */
  }
  return []
}

function genTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return '新对话'
  const t = first.content.replace(/\n/g, ' ').trim()
  return t.length > 24 ? `${t.slice(0, 24)}…` : t || '新对话'
}

export const useConversationsStore = defineStore('conversations', () => {
  const list = ref<Conversation[]>(loadConversations())
  const activeId = ref<string | null>(list.value[0]?.id ?? null)
  /** 隐身模式：消息仅驻留内存，不写入 localStorage / 历史列表 */
  const incognitoActive = ref(false)
  const incognitoMessages = ref<ChatMessage[]>([])

  watch(
    list,
    (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
    { deep: true },
  )

  const isIncognito = computed(() => incognitoActive.value)

  const activeConversation = computed(() =>
    incognitoActive.value ? null : list.value.find((c) => c.id === activeId.value) ?? null,
  )

  const sortedList = computed(() =>
    [...list.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

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

  /** 发送消息前：隐身模式无需创建持久会话 */
  function ensureMessagingSession(): void {
    if (incognitoActive.value) return
    ensureActive()
  }

  function createConversation(): Conversation {
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
    conv.title = genTitle(messages)
  }

  function deleteConversation(id: string) {
    list.value = list.value.filter((c) => c.id !== id)
    if (activeId.value === id) {
      activeId.value = list.value[0]?.id ?? null
    }
  }

  function ensureActive(): string {
    if (!activeId.value || !list.value.some((c) => c.id === activeId.value)) {
      if (list.value.length === 0) return createConversation().id
      activeId.value = list.value[0].id
    }
    return activeId.value!
  }

  return {
    list,
    activeId,
    activeConversation,
    sortedList,
    isIncognito,
    incognitoActive,
    startIncognito,
    exitIncognito,
    getIncognitoMessages,
    setIncognitoMessages,
    createConversation,
    selectConversation,
    getMessages,
    setMessages,
    deleteConversation,
    ensureActive,
    ensureMessagingSession,
  }
})
