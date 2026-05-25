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
  custom: '至少 16 位，可含字母、数字、-、_、.',
}

/** 按服务商做简单格式校验 */
export function validateApiKey(key: string, provider: ModelProvider): ApiKeyValidationResult {
  const k = key.trim()
  if (!k) return { valid: false, message: '请粘贴 API Key' }

  if (k.length < 16) {
    return { valid: false, message: '密钥长度过短（至少 16 位）' }
  }

  if (/\s/.test(k)) {
    return { valid: false, message: '密钥不能包含空格' }
  }

  switch (provider) {
    case 'anthropic':
      if (!/^sk-ant-[a-zA-Z0-9_-]{10,}$/.test(k)) {
        return {
          valid: false,
          message: 'Claude 密钥应以 sk-ant- 开头',
        }
      }
      break
    case 'deepseek':
    case 'openai':
    case 'qwen':
    case 'bailian':
      if (!/^sk-[a-zA-Z0-9_-]{16,}$/.test(k)) {
        return {
          valid: false,
          message: '密钥应以 sk- 开头，后为字母、数字、- 或 _',
        }
      }
      break
    case 'zhipu':
      if (!/^[a-zA-Z0-9]+(\.[a-zA-Z0-9_-]+)?$/.test(k) || k.length < 20) {
        return {
          valid: false,
          message: '智谱密钥格式不正确（通常为 id.secret 或长串字母数字）',
        }
      }
      break
    default:
      if (!/^[a-zA-Z0-9_.-]{16,}$/.test(k)) {
        return {
          valid: false,
          message: '密钥仅可包含字母、数字及 - _ .',
        }
      }
  }

  return { valid: true }
}

export function getApiKeyFormatHint(provider: ModelProvider): string {
  return FORMAT_HINT[provider] ?? FORMAT_HINT.custom!
}
