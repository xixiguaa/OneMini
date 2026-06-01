import { computed } from 'vue'
import { useCreateHistoryStore } from '../stores/createHistory'
import type { CreateHistoryItem } from '../stores/createHistory'
import type { MessageType } from '../types/agent'
import { resolveCreateHistoryImageUrl } from '../utils/createHistoryMedia'

export interface GalleryItem {
  id: string
  type: Extract<MessageType, 'image' | 'video'>
  prompt: string
  timestamp: number
  status: CreateHistoryItem['status']
  url?: string
  sessionId?: string
  parentId?: string
  aspectRatio?: string
}

export function useWorksGallery() {
  const createHistory = useCreateHistoryStore()

  const galleryItems = computed<GalleryItem[]>(() => {
    const latestBySession = new Map<string, GalleryItem>()
    for (const item of createHistory.sortedItems) {
      if (item.status === 'FAIL') continue
      const sid = item.sessionId || item.id
      const mapped: GalleryItem = {
        id: item.id,
        type: item.type,
        prompt: item.prompt,
        timestamp: item.createdAt,
        status: item.status,
        url: resolveCreateHistoryImageUrl(item),
        sessionId: item.sessionId,
        parentId: item.parentId,
        aspectRatio: item.aspectRatio,
      }
      const existing = latestBySession.get(sid)
      if (!existing || item.createdAt >= existing.timestamp) {
        latestBySession.set(sid, mapped)
      }
    }
    return [...latestBySession.values()].sort((a, b) => b.timestamp - a.timestamp)
  })

  const hasItems = computed(() => galleryItems.value.length > 0)
  const pendingCount = computed(() =>
    galleryItems.value.filter((i) => i.status === 'RUNNING').length,
  )

  return { galleryItems, hasItems, pendingCount }
}
