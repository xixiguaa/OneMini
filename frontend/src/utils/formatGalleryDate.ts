/** 发现页详情日期：2026-05-09 */
export function formatGalleryDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(ms))
    .replace(/\//g, '-')
}
