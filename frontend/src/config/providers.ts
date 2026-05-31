import type { ModelCapability } from '../types/agent'

/** 与 public/logos 下图标一一对应的服务商 */
export type ModelProvider =
  | 'openai'
  | 'deepseek'
  | 'anthropic'
  | 'zhipu'
  | 'qwen'
  | 'bailian'
  | 'doubao'
  | 'bytedance'
  | 'tencent'
  | 'yuanbao'
  | 'gemini'
  | 'kling'
  | 'minimax'
  | 'moonshot'
  | 'grok'
  | 'meta'
  | 'nanobanana'
  | 'custom'

export interface ProviderDefinition {
  id: ModelProvider
  label: string
  logo: string
  capabilities: ModelCapability[]
  defaultBaseUrl?: string
  /** 聊天 API 路由方式（服务端 OpenAI 兼容族） */
  routeFamily: 'openai' | 'anthropic' | 'zhipu' | 'tencent'
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    logo: '/logos/deepseek-color.svg',
    capabilities: ['chat'],
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    routeFamily: 'openai',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    logo: '/logos/openai.svg',
    capabilities: ['chat', 'multimodal', 'image', 'video'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    routeFamily: 'openai',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    logo: '/logos/claude-color.svg',
    capabilities: ['chat', 'multimodal'],
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    routeFamily: 'openai',
  },
  {
    id: 'zhipu',
    label: '智谱 AI',
    logo: '/logos/zhipu-color.svg',
    capabilities: ['chat', 'multimodal', 'image'],
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    routeFamily: 'zhipu',
  },
  {
    id: 'qwen',
    label: '通义千问',
    logo: '/logos/qwen-color.svg',
    capabilities: ['chat', 'multimodal', 'image'],
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    routeFamily: 'openai',
  },
  {
    id: 'bailian',
    label: '阿里云百炼',
    logo: '/logos/bailian-color.svg',
    capabilities: ['chat', 'multimodal', 'image'],
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    routeFamily: 'openai',
  },
  {
    id: 'doubao',
    label: '豆包',
    logo: '/logos/doubao-color.svg',
    capabilities: ['chat', 'multimodal', 'image', 'video'],
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    routeFamily: 'openai',
  },
  {
    id: 'bytedance',
    label: '字节跳动',
    logo: '/logos/bytedance-color.svg',
    capabilities: ['chat', 'multimodal', 'image', 'video'],
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
    routeFamily: 'openai',
  },
  {
    id: 'tencent',
    label: '腾讯混元',
    logo: '/logos/hunyuan-color.svg',
    capabilities: ['image', 'video', 'world'],
    routeFamily: 'tencent',
  },
  {
    id: 'yuanbao',
    label: '腾讯元宝',
    logo: '/logos/yuanbao-color.svg',
    capabilities: ['chat'],
    routeFamily: 'openai',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    logo: '/logos/gemini-color.svg',
    capabilities: ['chat', 'multimodal', 'image'],
    routeFamily: 'openai',
  },
  {
    id: 'kling',
    label: '可灵',
    logo: '/logos/kling-color.svg',
    capabilities: ['video'],
    routeFamily: 'openai',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    logo: '/logos/minimax-color.svg',
    capabilities: ['chat'],
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    routeFamily: 'openai',
  },
  {
    id: 'moonshot',
    label: 'Kimi',
    logo: '/logos/kimi-color.svg',
    capabilities: ['chat'],
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    routeFamily: 'openai',
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    logo: '/logos/grok.svg',
    capabilities: ['chat'],
    routeFamily: 'openai',
  },
  {
    id: 'meta',
    label: 'Meta',
    logo: '/logos/meta-color.svg',
    capabilities: ['chat'],
    routeFamily: 'openai',
  },
  {
    id: 'nanobanana',
    label: 'Nano Banana',
    logo: '/logos/nanobanana-color.svg',
    capabilities: ['image'],
    routeFamily: 'openai',
  },
]

/** 未知/历史服务商的内部兜底，不在 UI 中展示 */
const FALLBACK_PROVIDER: ProviderDefinition = {
  id: 'custom',
  label: '其他',
  logo: '/logos/openai.svg',
  capabilities: ['chat', 'multimodal'],
  routeFamily: 'openai',
}

const BY_ID = Object.fromEntries(
  PROVIDER_DEFINITIONS.map((p) => [p.id, p]),
) as Record<ModelProvider, ProviderDefinition>

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  ...Object.fromEntries(PROVIDER_DEFINITIONS.map((p) => [p.id, p.label])),
  custom: FALLBACK_PROVIDER.label,
} as Record<ModelProvider, string>

export function getProviderDefinition(id: ModelProvider): ProviderDefinition {
  return BY_ID[id] ?? FALLBACK_PROVIDER
}

export function getProviderLogo(id: ModelProvider): string {
  return getProviderDefinition(id).logo
}

export function getProviderLabel(id: ModelProvider): string {
  return getProviderDefinition(id).label
}

export function getProvidersForCapability(cap: ModelCapability): ModelProvider[] {
  return PROVIDER_DEFINITIONS.filter((p) => p.capabilities.includes(cap)).map((p) => p.id)
}

/** 走 OpenAI 兼容聊天接口的服务商（含自定义与其它品牌） */
export function isOpenAICompatibleProvider(id: ModelProvider): boolean {
  const def = getProviderDefinition(id)
  return def.routeFamily === 'openai' || def.routeFamily === 'zhipu' || id === 'custom'
}

export function resolveChatBaseUrl(provider: ModelProvider, baseUrl?: string): string {
  return baseUrl?.trim() || getProviderDefinition(provider).defaultBaseUrl || ''
}
