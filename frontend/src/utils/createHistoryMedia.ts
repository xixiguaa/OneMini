import { getClientUserId } from './userId'

const MEDIA_PATH = '/api/platform/create-history/media/'

/** 浏览器 <img> 无法带 X-User-Id，媒体地址需带 userId 查询参数 */
export function createHistoryMediaUrl(itemId: string): string {
  const uid = encodeURIComponent(getClientUserId())
  const id = encodeURIComponent(itemId)
  return `${MEDIA_PATH}${id}?userId=${uid}`
}

/** 为已有代理地址补全 userId（兼容旧数据） */
export function withCreateHistoryMediaUser(url: string): string {
  if (!url.includes(MEDIA_PATH)) return url
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const u = new URL(url, base)
    if (!u.searchParams.has('userId')) {
      u.searchParams.set('userId', getClientUserId())
      return u.pathname + u.search
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
  if (item.type !== 'image') return raw
  if (item.status !== 'DONE' || !item.id) return raw
  if (raw && !raw.includes(MEDIA_PATH) && (raw.startsWith('http') || raw.startsWith('data:'))) {
    return raw
  }
  if (raw?.includes(MEDIA_PATH)) return withCreateHistoryMediaUser(raw)
  return createHistoryMediaUrl(item.id)
}
