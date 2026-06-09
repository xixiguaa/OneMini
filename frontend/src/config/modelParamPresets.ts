/** 模型参数一键预设 */
export interface ModelParamPreset {
  id: string
  label: string
  description: string
  temperature: number
  maxTokens?: number
}

export const MODEL_PARAM_PRESETS: ModelParamPreset[] = [
  {
    id: 'precise-support',
    label: '严谨客服',
    description: '准确、克制、少发散',
    temperature: 0.15,
    maxTokens: 2048,
  },
  {
    id: 'creative-copy',
    label: '灵感文案',
    description: '更有创造力与表达力',
    temperature: 0.85,
    maxTokens: 4096,
  },
  {
    id: 'roleplay',
    label: '角色扮演',
    description: '沉浸感与个性化回复',
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    id: 'balanced',
    label: '均衡默认',
    description: '日常对话与创作兼顾',
    temperature: 0.35,
    maxTokens: 4096,
  },
]
