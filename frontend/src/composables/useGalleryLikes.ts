import { ref, watch } from 'vue'

const STORAGE_KEY = 'onemini-gallery-likes-v2'

type LikeStore = {
  likedByMe: string[]
  counts: Record<string, number>
}

function loadStore(): LikeStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { likedByMe: [], counts: {} }
    const parsed = JSON.parse(raw) as Partial<LikeStore> & { ids?: string[] }
    if (Array.isArray(parsed.ids)) {
      const counts: Record<string, number> = {}
      for (const id of parsed.ids) {
        if (typeof id === 'string') counts[id] = Math.max(1, counts[id] ?? 0)
      }
      return { likedByMe: parsed.ids.filter((id) => typeof id === 'string'), counts }
    }
    const likedByMe = Array.isArray(parsed.likedByMe)
      ? parsed.likedByMe.filter((id) => typeof id === 'string')
      : []
    const counts =
      parsed.counts && typeof parsed.counts === 'object' ? { ...parsed.counts } : {}
    for (const id of likedByMe) {
      if (!counts[id]) counts[id] = 1
    }
    return { likedByMe, counts }
  } catch {
    return { likedByMe: [], counts: {} }
  }
}

const store = ref<LikeStore>(loadStore())

watch(
  store,
  (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
    } catch {
      /* ignore */
    }
  },
  { deep: true },
)

export function useGalleryLikes() {
  function isLiked(itemId: string): boolean {
    return store.value.likedByMe.includes(itemId)
  }

  function likeCount(itemId: string): number {
    return Math.max(0, store.value.counts[itemId] ?? 0)
  }

  function toggleLike(itemId: string) {
    const liked = isLiked(itemId)
    const counts = { ...store.value.counts }
    const likedByMe = [...store.value.likedByMe]

    if (liked) {
      const next = Math.max(0, (counts[itemId] ?? 0) - 1)
      if (next === 0) delete counts[itemId]
      else counts[itemId] = next
      const idx = likedByMe.indexOf(itemId)
      if (idx >= 0) likedByMe.splice(idx, 1)
    } else {
      counts[itemId] = (counts[itemId] ?? 0) + 1
      if (!likedByMe.includes(itemId)) likedByMe.push(itemId)
    }

    store.value = { counts, likedByMe }
  }

  function likedItemIds(): string[] {
    return [...store.value.likedByMe]
  }

  return { isLiked, likeCount, toggleLike, likedItemIds }
}
