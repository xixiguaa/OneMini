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

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/plan/v3'
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'
const ZHIPU_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const MINIMAX_BASE = 'https://api.minimax.chat/v1'
const MOONSHOT_BASE = 'https://api.moonshot.cn/v1'
const DOUBAO_SEEDREAM_5_LITE: ProviderModelOption = {
  model: 'doubao-seedream-5.0-lite',
  label: 'Doubao-Seedream-5.0-lite',
  baseUrl: ARK_BASE,
}
const DOUBAO_SEEDANCE_2: ProviderModelOption = {
  model: 'doubao-seedance-2.0',
  label: 'Doubao-Seedance-2.0',
  baseUrl: ARK_BASE,
}
const DOUBAO_SEEDANCE_2_FAST: ProviderModelOption = {
  model: 'doubao-seedance-2.0-fast',
  label: 'Doubao-Seedance-2.0-fast',
  baseUrl: ARK_BASE,
}
const DOUBAO_SEEDANCE_1_5_PRO: ProviderModelOption = {
  model: 'doubao-seedance-1.5-pro',
  label: 'Doubao-Seedance-1.5-pro',
  baseUrl: ARK_BASE,
}

/** 各服务商在对应能力下可选的具体模型（用于 API 路由） */
export const PROVIDER_MODEL_OPTIONS: Record<
  ModelProvider,
  Partial<Record<ModelCapability, ProviderModelOption[]>>
> = {
  deepseek: {
    chat: [
      { model: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', baseUrl: DEEPSEEK_BASE },
      { model: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', baseUrl: DEEPSEEK_BASE },
      { model: 'deepseek-v3.2', label: 'DeepSeek V3.2', baseUrl: DEEPSEEK_BASE },
      { model: 'deepseek-chat', label: 'DeepSeek Chat', baseUrl: DEEPSEEK_BASE },
      { model: 'deepseek-reasoner', label: 'DeepSeek Reasoner', baseUrl: DEEPSEEK_BASE },
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
    chat: [{ model: 'glm-5.1', label: 'GLM-5.1', baseUrl: ZHIPU_BASE }],
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
      { model: 'doubao-seed-2.0-pro', label: 'Doubao Seed 2.0 Pro', baseUrl: ARK_BASE },
      { model: 'doubao-seed-2.0-code', label: 'Doubao Seed 2.0 Code', baseUrl: ARK_BASE },
      { model: 'doubao-seed-2.0-lite', label: 'Doubao Seed 2.0 Lite', baseUrl: ARK_BASE },
      { model: 'doubao-seed-2.0-mini', label: 'Doubao Seed 2.0 Mini', baseUrl: ARK_BASE },
      { model: 'doubao-pro-32k', label: '豆包 Pro', baseUrl: ARK_BASE },
    ],
    image: [DOUBAO_SEEDREAM_5_LITE],
    video: [DOUBAO_SEEDANCE_2, DOUBAO_SEEDANCE_2_FAST, DOUBAO_SEEDANCE_1_5_PRO],
  },
  bytedance: {
    chat: [
      { model: 'doubao-seed-2.0-pro', label: 'Doubao Seed 2.0 Pro', baseUrl: ARK_BASE },
      { model: 'doubao-seed-2.0-code', label: 'Doubao Seed 2.0 Code', baseUrl: ARK_BASE },
      { model: 'doubao-seed-2.0-lite', label: 'Doubao Seed 2.0 Lite', baseUrl: ARK_BASE },
      { model: 'doubao-seed-2.0-mini', label: 'Doubao Seed 2.0 Mini', baseUrl: ARK_BASE },
    ],
    image: [DOUBAO_SEEDREAM_5_LITE],
    video: [DOUBAO_SEEDANCE_2, DOUBAO_SEEDANCE_2_FAST, DOUBAO_SEEDANCE_1_5_PRO],
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
    chat: [{ model: 'minimax-m2.7', label: 'MiniMax M2.7', baseUrl: MINIMAX_BASE }],
  },
  moonshot: {
    chat: [{ model: 'kimi-k2.6', label: 'Kimi K2.6', baseUrl: MOONSHOT_BASE }],
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
