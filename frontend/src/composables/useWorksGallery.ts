import { computed } from 'vue'
import { useConversationsStore } from '../stores/conversations'
import type { MessageType } from '../types/agent'

export interface WorkItem {
  id: string
  type: Extract<MessageType, 'image' | 'video'>
  url: string
  prompt: string
  timestamp: number
}

export function useWorksGallery() {
  const conversations = useConversationsStore()

  const works = computed(() => {
    const items: WorkItem[] = []
    for (const conv of conversations.list) {
      for (const msg of conv.messages) {
        if (msg.role !== 'assistant') continue
        if (msg.type !== 'image' && msg.type !== 'video') continue
        const url = msg.attachments?.url || msg.attachments?.previewUrl
        if (!url) continue
        items.push({
          id: msg.id,
          type: msg.type,
          url,
          prompt: msg.content,
          timestamp: msg.timestamp,
        })
      }
    }
    return items.sort((a, b) => b.timestamp - a.timestamp)
  })

  return { works }
}
