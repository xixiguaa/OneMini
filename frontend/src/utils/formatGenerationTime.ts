/** 展示作品/版本的生成时间（本地时区） */
export function formatGenerationTime(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}
