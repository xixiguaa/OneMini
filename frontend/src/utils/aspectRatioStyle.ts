/** 将 "16:9" 等比例 id 转为 CSS aspect-ratio 值 */
export function cssAspectRatio(ratioId: string | undefined, fallback = '1 / 1'): string {
  const id = !ratioId || ratioId === 'smart' ? '16:9' : ratioId
  const parts = id.split(':')
  if (parts.length !== 2) return fallback
  const w = parseInt(parts[0], 10)
  const h = parseInt(parts[1], 10)
  if (!w || !h) return fallback
  return `${w} / ${h}`
}

/** 作品卡片基准边长（1:1 时为 355×355） */
export const GALLERY_ITEM_BASE = 355

/** 按宽高比计算作品卡片展示尺寸 */
export function galleryItemDimensions(
  ratioId: string | undefined,
  base = GALLERY_ITEM_BASE,
): { width: number; height: number } {
  const id = !ratioId || ratioId === 'smart' ? '16:9' : ratioId
  const parts = id.split(':').map((n) => parseInt(n, 10))
  if (parts.length !== 2 || parts.some((n) => !n)) {
    return { width: base, height: base }
  }
  const [wR, hR] = parts
  if (wR >= hR) {
    return { width: base, height: Math.round((base * hR) / wR) }
  }
  return { width: Math.round((base * wR) / hR), height: base }
}
