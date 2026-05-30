/** 从 FastAPI / 平台 API 响应体提取错误文案 */
export function parseApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const body = data as Record<string, unknown>

  const detail = body.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg?: unknown }).msg ?? '')
        }
        return ''
      })
      .filter(Boolean)
    if (parts.length) return parts.join('；')
  }

  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
  if (body.error && typeof body.error === 'object') {
    const errObj = body.error as Record<string, unknown>
    if (typeof errObj.message === 'string' && errObj.message.trim()) return errObj.message.trim()
  }
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()

  return fallback
}
