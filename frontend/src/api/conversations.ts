import axios from 'axios'
import type { ChatMessage, Conversation } from '../types/agent'

const api = axios.create({
  baseURL: '/api/platform/conversations',
  timeout: 120000,
})

const USER_HEADER = 'X-User-Id'

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
): Promise<Conversation> {
  const { data } = await api.put<Conversation>(`/${conversationId}/messages`, { messages })
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

export async function fetchChatStorageInfo() {
  const { data } = await api.get('/storage/info')
  return data
}

export function setConversationUserId(userId: string) {
  api.defaults.headers.common[USER_HEADER] = userId
}
