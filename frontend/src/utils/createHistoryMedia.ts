import { getAuthToken } from './authToken'

const MEDIA_PATH = '/api/platform/create-history/media/'
const PUBLIC_MEDIA_PATH = '/api/platform/create-history/public/media/'

/** 浏览器 <img> 无法带 Authorization，使用 access_token 查询参数 */
export function createHistoryMediaUrl(itemId: string): string {
  const id = encodeURIComponent(itemId)
  const token = getAuthToken()
  if (!token) return ''
  return `${MEDIA_PATH}${id}?access_token=${encodeURIComponent(token)}`
}

export function publicGalleryMediaUrl(itemId: string): string {
  const id = encodeURIComponent(itemId)
  const token = getAuthToken()
  if (!token) return ''
  return `${PUBLIC_MEDIA_PATH}${id}?access_token=${encodeURIComponent(token)}`
}

export function withCreateHistoryMediaToken(url: string): string {
  if (!url.includes(MEDIA_PATH) && !url.includes(PUBLIC_MEDIA_PATH)) return url
  const token = getAuthToken()
  if (!token) return url
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const u = new URL(url, base)
    if (!u.searchParams.has('access_token')) {
      u.searchParams.set('access_token', token)
    }
    return url.startsWith('http') ? u.toString() : u.pathname + u.search
  } catch {
    return url
  }
}

export function resolveCreateHistoryImageUrl(item: {
  id: string
  type: string
  status: string
  url?: string
  previewUrl?: string
}): string | undefined {
  const raw = item.url || item.previewUrl
  if (item.status !== 'DONE' || !item.id) return raw
  if (raw && !raw.includes(MEDIA_PATH) && (raw.startsWith('http') || raw.startsWith('data:'))) {
    return raw
  }
  if (raw?.includes(MEDIA_PATH)) return withCreateHistoryMediaToken(raw)
  if (item.type === 'image' || item.type === 'video') {
    return createHistoryMediaUrl(item.id)
  }
  return raw
}

export function resolvePublicGalleryMediaUrl(item: {
  id: string
  type: string
  status: string
  url?: string
  previewUrl?: string
}): string | undefined {
  const raw = item.url || item.previewUrl
  if (item.status !== 'DONE' || !item.id) return raw
  if (raw && !raw.includes(PUBLIC_MEDIA_PATH) && (raw.startsWith('http') || raw.startsWith('data:'))) {
    return raw
  }
  if (raw?.includes(PUBLIC_MEDIA_PATH)) return withCreateHistoryMediaToken(raw)
  if (item.type === 'image' || item.type === 'video') {
    return publicGalleryMediaUrl(item.id)
  }
  return raw
}
