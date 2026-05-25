import type { ModelCapability } from '../types/agent'
import type { ModelProvider } from './providers'
import { getProviderDefinition, getProvidersForCapability } from './providers'

export type { ModelProvider }
export { getProvidersForCapability }

export interface ProviderModelOption {
  model: string
  label: string
  baseUrl?: string
  description?: string
}

const MANUAL: ProviderModelOption = { model: '', label: '手动填写 model 标识' }

/** 各服务商在对应能力下可选的具体模型（用于 API 路由） */
export const PROVIDER_MODEL_OPTIONS: Record<
  ModelProvider,
  Partial<Record<ModelCapability, ProviderModelOption[]>>
> = {
  deepseek: {
    chat: [
      { model: 'deepseek-chat', label: 'DeepSeek Chat', baseUrl: 'https://api.deepseek.com/v1' },
      { model: 'deepseek-reasoner', label: 'DeepSeek Reasoner', baseUrl: 'https://api.deepseek.com/v1' },
    ],
  },
  openai: {
    chat: [
      { model: 'gpt-4o', label: 'GPT-4o', baseUrl: 'https://api.openai.com/v1' },
      { model: 'gpt-4o-mini', label: 'GPT-4o Mini', baseUrl: 'https://api.openai.com/v1' },
      { model: 'gpt-5.5-high', label: 'GPT-5.5 High（兼容）', baseUrl: 'https://api.openai.com/v1' },
    ],
    image: [{ model: 'dall-e-3', label: 'DALL·E 3', baseUrl: 'https://api.openai.com/v1' }],
    video: [{ model: 'sora', label: 'Sora（需开通）', baseUrl: 'https://api.openai.com/v1' }],
  },
  anthropic: {
    chat: [
      { model: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', baseUrl: 'https://api.anthropic.com/v1' },
      { model: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', baseUrl: 'https://api.anthropic.com/v1' },
    ],
  },
  zhipu: {
    chat: [
      { model: 'glm-4-plus', label: 'GLM-4 Plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
      { model: 'glm-4-flash', label: 'GLM-4 Flash', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
    ],
    image: [{ model: 'cogview-3-plus', label: 'CogView 3 Plus', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' }],
  },
  qwen: {
    chat: [
      { model: 'qwen-plus', label: 'Qwen Plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      { model: 'qwen-turbo', label: 'Qwen Turbo', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    ],
    image: [{ model: 'wanx-v1', label: '通义万相', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }],
  },
  bailian: {
    chat: [
      { model: 'qwen-plus', label: '百炼 · Qwen Plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    ],
    image: [MANUAL],
  },
  doubao: {
    chat: [
      { model: 'doubao-pro-32k', label: '豆包 Pro', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
    ],
    image: [MANUAL],
    video: [MANUAL],
  },
  bytedance: {
    chat: [MANUAL],
    image: [MANUAL],
    video: [MANUAL],
  },
  tencent: {
    world: [
      { model: 'hunyuan-3d-pro', label: '混元 3D 专业版', description: '使用服务端 .env 腾讯云密钥' },
      { model: 'rapid', label: '混元 3D Rapid', description: '快速生成' },
    ],
    image: [{ model: 'hunyuan-image', label: '混元生图', description: '腾讯云 AI 绘画' }],
    video: [{ model: 'hunyuan-video', label: '混元视频' }],
  },
  yuanbao: {
    chat: [MANUAL],
  },
  gemini: {
    chat: [
      { model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: '请填写 Google AI 兼容 Base URL' },
    ],
    image: [MANUAL],
  },
  kling: {
    video: [MANUAL],
  },
  minimax: {
    chat: [
      { model: 'abab6.5s-chat', label: 'MiniMax 对话', baseUrl: 'https://api.minimax.chat/v1' },
    ],
  },
  grok: {
    chat: [MANUAL],
  },
  meta: {
    chat: [MANUAL],
  },
  nanobanana: {
    image: [MANUAL],
  },
  custom: {},
}

export function getModelOptions(
  provider: ModelProvider,
  cap: ModelCapability,
): ProviderModelOption[] {
  const opts = PROVIDER_MODEL_OPTIONS[provider]?.[cap]
  if (opts?.length) return opts
  if (getProviderDefinition(provider).capabilities.includes(cap)) {
    return [{ ...MANUAL, baseUrl: getProviderDefinition(provider).defaultBaseUrl }]
  }
  return []
}

export function findModelOption(
  provider: ModelProvider,
  cap: ModelCapability,
  model: string,
): ProviderModelOption | undefined {
  return getModelOptions(provider, cap).find((o) => o.model === model)
}
