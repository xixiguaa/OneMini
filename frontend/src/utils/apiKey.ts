import type { ModelProvider } from '../config/providers'

/** 脱敏展示 API Key，不可用于还原 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 10) return '*'.repeat(trimmed.length)
  const head = trimmed.slice(0, 7)
  const tail = trimmed.slice(-4)
  const midLen = Math.min(28, Math.max(8, trimmed.length - 11))
  return `${head}${'*'.repeat(midLen)}${tail}`
}

export function preventCopy(e: ClipboardEvent) {
  e.preventDefault()
}

export interface ApiKeyValidationResult {
  valid: boolean
  message?: string
}

const FORMAT_HINT: Partial<Record<ModelProvider, string>> = {
  openai: '格式示例：sk-xxxxxxxx',
  deepseek: '格式示例：sk-xxxxxxxx',
  anthropic: '格式示例：sk-ant-xxxxxxxx',
  zhipu: '格式示例：32 位密钥，可含 id.secret 形式',
  qwen: '格式示例：sk-xxxxxxxx（DashScope）',
  bailian: '格式示例：sk-xxxxxxxx（百炼 / DashScope）',
  doubao: '格式示例：火山方舟 API Key',
  bytedance: '格式示例：火山方舟 API Key',
  minimax: '格式示例：MiniMax API Key',
  moonshot: '格式示例：sk-xxxxxxxx（Moonshot / Kimi）',
  custom: '至少 16 位，可含字母、数字、-、_、.',
}

/** 按服务商做简单格式校验（不限制 sk- 等前缀，兼容火山方舟等接入方式） */
export function validateApiKey(key: string, _provider?: ModelProvider): ApiKeyValidationResult {
  const k = key.trim()
  if (!k) return { valid: false, message: '请粘贴 API Key' }

  if (k.length < 8) {
    return { valid: false, message: '密钥长度过短（至少 8 位）' }
  }

  if (/\s/.test(k)) {
    return { valid: false, message: '密钥不能包含空格' }
  }

  return { valid: true }
}

export function getApiKeyFormatHint(provider: ModelProvider): string {
  return FORMAT_HINT[provider] ?? FORMAT_HINT.custom!
}
