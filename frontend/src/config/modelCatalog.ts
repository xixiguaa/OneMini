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

/** 内置对话模型预设（3D 世界请在模型配置右侧自行添加） */
export const MODEL_CATALOG: PresetTemplate[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    model: 'deepseek-chat',
    capability: 'chat',
    baseUrl: 'https://api.deepseek.com/v1',
    description: 'DeepSeek 旗舰对话模型',
    brandColor: '#4d6bfe',
  },
  {
    id: 'gpt-5.5-high',
    name: 'GPT-5.5 High',
    provider: 'openai',
    model: 'gpt-5.5-high',
    capability: 'chat',
    baseUrl: 'https://api.openai.com/v1',
    description: 'OpenAI 高阶对话（兼容接口）',
    brandColor: '#10a37f',
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    capability: 'chat',
    baseUrl: 'https://api.anthropic.com/v1',
    description: 'Anthropic Claude',
    brandColor: '#d97757',
  },
  {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    provider: 'zhipu',
    model: 'glm-4-plus',
    capability: 'chat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    description: '智谱 GLM',
    brandColor: '#1e80ff',
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
    apiKey: '',
    ...overrides,
  }
}

export function buildDefaultModels(): ModelConfig[] {
  return MODEL_CATALOG.map((p) => catalogToModel(p))
}
