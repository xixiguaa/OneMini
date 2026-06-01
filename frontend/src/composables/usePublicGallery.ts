import { computed, ref } from 'vue'
import { fetchPublicGallery, publishPublicGallery } from '../api/publicGallery'
import type { CreateHistoryItem } from '../stores/createHistory'
import type { MessageType } from '../types/agent'
import { resolvePublicGalleryMediaUrl } from '../utils/createHistoryMedia'
import type { GalleryItem } from './useWorksGallery'

function mapItem(item: CreateHistoryItem): GalleryItem {
  return {
    id: item.id,
    type: item.type as Extract<MessageType, 'image' | 'video'>,
    prompt: item.prompt,
    timestamp: item.createdAt,
    status: item.status,
    url: resolvePublicGalleryMediaUrl(item),
    aspectRatio: item.aspectRatio,
  }
}

const items = ref<CreateHistoryItem[]>([])
const publishedIds = ref<Set<string>>(new Set())
const hydrated = ref(false)
let hydrateTask: Promise<void> | null = null

export function usePublicGallery() {
  const galleryItems = computed<GalleryItem[]>(() =>
    items.value
      .filter((i) => i.status !== 'FAIL')
      .map(mapItem)
      .sort((a, b) => b.timestamp - a.timestamp),
  )

  function isPublished(itemId: string | undefined | null): boolean {
    if (!itemId) return false
    return publishedIds.value.has(itemId) || items.value.some((i) => i.id === itemId)
  }

  async function hydrate(force = false) {
    if (!force && hydrated.value) return
    if (hydrateTask) return hydrateTask
    hydrateTask = (async () => {
      try {
        const [images, videos] = await Promise.all([
          fetchPublicGallery('image'),
          fetchPublicGallery('video'),
        ])
        items.value = [...images, ...videos]
        publishedIds.value = new Set(items.value.map((i) => i.id))
        hydrated.value = true
      } catch (err) {
        hydrated.value = false
        console.warn('[publicGallery] hydrate failed', err)
      } finally {
        hydrateTask = null
      }
    })()
    return hydrateTask
  }

  async function publish(itemId: string) {
    const item = await publishPublicGallery(itemId)
    publishedIds.value = new Set([...publishedIds.value, item.id])
    const idx = items.value.findIndex((i) => i.id === item.id)
    if (idx >= 0) items.value[idx] = item
    else items.value = [item, ...items.value]
    hydrated.value = true
    return item
  }

  return { galleryItems, hydrated, hydrate, isPublished, publish }
}
