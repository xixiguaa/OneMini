import axios from 'axios'
import type { ChatMessage, Conversation, MessageFeedback, WorkingMemoryState } from '../types/agent'
import { setupAuthInterceptors } from '../utils/setupAuthInterceptors'

const api = axios.create({
  baseURL: '/api/platform/conversations',
  timeout: 120000,
})

setupAuthInterceptors(api)

export async function fetchConversations(includeMessages = true): Promise<Conversation[]> {
  const { data } = await api.get<{ conversations: Conversation[] }>('', {
    params: includeMessages ? { include: 'messages' } : undefined,
  })
  return data.conversations
}

export async function createConversationApi(payload?: {
  id?: string
  title?: string
}): Promise<Conversation> {
  const { data } = await api.post<Conversation>('', payload ?? {})
  return { ...data, messages: data.messages ?? [] }
}

export async function replaceConversationMessages(
  conversationId: string,
  messages: ChatMessage[],
  opts?: { activeLeafId?: string | null; workingMemory?: WorkingMemoryState },
): Promise<Conversation> {
  const { data } = await api.put<Conversation>(`/${conversationId}/messages`, {
    messages,
    activeLeafId: opts?.activeLeafId ?? undefined,
    workingMemory: opts?.workingMemory,
  })
  return data
}

export async function patchMessageFeedbackApi(
  conversationId: string,
  messageId: string,
  feedback: MessageFeedback | null,
): Promise<ChatMessage> {
  const { data } = await api.patch<ChatMessage>(
    `/${conversationId}/messages/${messageId}/feedback`,
    { feedback },
  )
  return data
}

export async function deleteConversationApi(conversationId: string): Promise<void> {
  await api.delete(`/${conversationId}`)
}

export async function importConversationsApi(conversations: Conversation[]): Promise<{
  imported: number
  total: number
}> {
  const { data } = await api.post<{ imported: number; total: number }>('/import', {
    conversations,
  })
  return data
}

export interface EpisodicMemoryHit {
  id: string
  score: number
  conversationId?: string
  role?: string
  type?: string
  content?: string
  timestamp?: number
}

/** 情节记忆 (Episodic Memory)：跨会话语义检索 */
export async function searchEpisodicMemory(
  query: string,
  topK = 5,
): Promise<EpisodicMemoryHit[]> {
  const { data } = await api.post<{ hits: EpisodicMemoryHit[] }>('/search', {
    query,
    top_k: topK,
  })
  return data.hits ?? []
}
