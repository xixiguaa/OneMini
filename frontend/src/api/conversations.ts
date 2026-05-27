import axios from 'axios'
import type { ChatMessage, Conversation } from '../types/agent'
import { getClientUserId } from '../utils/userId'

const api = axios.create({
  baseURL: '/api/platform/conversations',
  timeout: 120000,
})

api.interceptors.request.use((config) => {
  config.headers.set('X-User-Id', getClientUserId())
  return config
})

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

/** @deprecated 使用 getClientUserId() 自动附带请求头 */
export function setConversationUserId(_userId: string) {
  /* 保留 API 兼容；实际由拦截器注入 */
}
