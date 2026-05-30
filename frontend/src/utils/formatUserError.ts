/** 将 API / 运行时错误转为用户可读提示 */
export function formatUserError(err: unknown, fallback = '操作失败'): string {
  let raw = fallback
  if (err instanceof Error) raw = err.message
  else if (typeof err === 'string') raw = err

  raw = raw.trim()
  if (!raw) return fallback

  return humanizeError(raw)
}

function humanizeError(raw: string): string {
  const lower = raw.toLowerCase()

  if (
    lower.includes('image size must be at least') ||
    lower.includes('size') && lower.includes('not valid')
  ) {
    return '当前宽高比或尺寸不符合模型要求，请尝试 1:1 / 16:9 等常用比例'
  }
  if (raw.includes('未配置 API Key') || lower.includes('api key')) {
    return '未配置 API Key，请在「模型配置」中保存密钥'
  }
  if (raw.includes('未指定图片模型') || raw.includes('未指定') && raw.includes('模型')) {
    return raw.length <= 120 ? raw : '请在创作页选择模型，或在「模型配置」中绑定'
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return '请求超时，请稍后重试'
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return '网络异常，请检查连接或确认后端已启动'
  }

  const firstLine = raw.split('\n')[0]?.trim() || raw
  if (firstLine.length > 180) return `${firstLine.slice(0, 177)}…`
  return firstLine
}
