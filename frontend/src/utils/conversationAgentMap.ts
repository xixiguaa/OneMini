import type { Conversation } from '../types/agent'
import { DEFAULT_USER_AGENT_ID } from '../types/userAgent'

const STORAGE_KEY = 'onemini-conversation-agents-v1'

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, string>
  } catch {
    /* ignore */
  }
  return {}
}

function saveMap(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function resolveConversationAgentId(conversation: Conversation): string {
  if (conversation.agentId) return conversation.agentId
  const map = loadMap()
  return map[conversation.id] ?? DEFAULT_USER_AGENT_ID
}

export function applyConversationAgentIds(conversations: Conversation[]): Conversation[] {
  const map = loadMap()
  return conversations.map((conv) => ({
    ...conv,
    agentId: conv.agentId ?? map[conv.id] ?? DEFAULT_USER_AGENT_ID,
  }))
}

export function bindConversationAgent(conversationId: string, agentId: string) {
  const map = loadMap()
  map[conversationId] = agentId
  saveMap(map)
}

export function unbindConversationAgent(conversationId: string) {
  const map = loadMap()
  delete map[conversationId]
  saveMap(map)
}
