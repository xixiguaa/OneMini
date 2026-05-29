import type { ModelCapability, ModelConfig, ModelProvider } from '../types/agent'

export interface PresetTemplate {
  id: string
  name: string
  provider: ModelProvider
  model: string
  capability: ModelCapability
  baseUrl?: string
  description: string
  brandColor?: string
}

/** 内置预设：文本对话仅保留 DeepSeek，其它能力请用「添加模型」自定义 */
export const MODEL_CATALOG: PresetTemplate[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4',
    provider: 'deepseek',
    model: 'deepseek-chat',
    capability: 'chat',
    baseUrl: 'https://api.deepseek.com/v1',
    description: '内置 DeepSeek 对话；MiniMax、GPT、Claude 等请通过「添加模型」自行配置',
    brandColor: '#4d6bfe',
  },
]

export function catalogToModel(
  preset: PresetTemplate,
  overrides?: Partial<ModelConfig>,
): ModelConfig {
  return {
    id: preset.id,
    name: preset.name,
    provider: preset.provider,
    model: preset.model,
    capability: preset.capability,
    baseUrl: preset.baseUrl,
    description: preset.description,
    enabled: false,
    preset: true,
    secretConfigured: false,
    ...overrides,
  }
}

export function buildDefaultModels(): ModelConfig[] {
  return MODEL_CATALOG.map((p) => catalogToModel(p))
}
