import type { ModelCapability, SkillConfig } from '../types/agent'

export const DEFAULT_SKILLS: SkillConfig[] = [
  {
    id: 'chat',
    name: '文本对话',
    description: '支持上传图片与文档，类似 Claude',
    icon: 'MessageSquare',
    enabled: true,
    defaultModelId: 'deepseek-v4-pro',
    systemPrompt:
      '你是 OneMini 智能助手，多模态 AI 创作搭档。请结合用户上传的文件内容，用简洁专业的中文回答问题；自称 OneMini，不要使用「森林小助手」等别称。',
  },
  {
    id: 'image',
    name: '图片生成',
    description: '参考即梦，文生图与技能模板',
    icon: 'Image',
    enabled: true,
    defaultModelId: '',
    systemPrompt: '根据用户描述生成高质量图片。',
  },
  {
    id: 'video',
    name: '视频生成',
    description: '参考即梦，文生/图生视频',
    icon: 'Video',
    enabled: true,
    defaultModelId: '',
    systemPrompt: '根据用户描述规划视频画面与运镜。',
  },
  {
    id: 'world',
    name: '世界生成',
    description: '在本页文生/图生 3D 场景，需配置腾讯云 3D API',
    icon: 'Globe',
    enabled: true,
    defaultModelId: '',
    systemPrompt: '根据描述生成 3D 世界场景。',
  },
]

export const CAPABILITY_LABELS: Record<string, string> = {
  chat: '文本对话',
  multimodal: '多模态',
  image: '图片生成',
  video: '视频生成',
  world: '世界生成',
}

/** 多模态模型能力说明（模型配置页展示） */
export const MULTIMODAL_FEATURE_TAGS = [
  '文本对话',
  '图片理解',
  '文件读取',
  '图片生成',
  '视频生成',
] as const

/** 模型配置页侧栏分组 */
export type ModelConfigGroupId = 'language' | 'multimodal' | 'vision' | 'embodied'

export const VISION_MEDIA_TYPES: { value: 'image' | 'video'; label: string }[] = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]

export const MODEL_CONFIG_GROUPS: {
  id: ModelConfigGroupId
  label: string
  capabilities: ModelCapability[]
  defaultCapability: ModelCapability
}[] = [
  { id: 'language', label: '语言模型', capabilities: ['chat'], defaultCapability: 'chat' },
  {
    id: 'multimodal',
    label: '多模态模型',
    capabilities: ['multimodal'],
    defaultCapability: 'multimodal',
  },
  { id: 'vision', label: '视觉模型', capabilities: ['image', 'video'], defaultCapability: 'image' },
  { id: 'embodied', label: '世界模型', capabilities: ['world'], defaultCapability: 'world' },
]

/** 对话场景可选用：纯语言 + 多模态 */
export const CHAT_MODEL_CAPABILITIES: ModelCapability[] = ['chat', 'multimodal']

export function getModelConfigGroup(cap: ModelCapability) {
  return MODEL_CONFIG_GROUPS.find((g) => g.capabilities.includes(cap))
}

export function getModelConfigGroupById(id: ModelConfigGroupId) {
  return MODEL_CONFIG_GROUPS.find((g) => g.id === id)
}

/** 模型配置中的能力展示名（技能页仍用 CAPABILITY_LABELS） */
export function getModelCapabilityLabel(cap: ModelCapability): string {
  if (cap === 'multimodal') return CAPABILITY_LABELS.multimodal
  const group = getModelConfigGroup(cap)
  if (!group) return cap
  if (group.id === 'vision') {
    const media = VISION_MEDIA_TYPES.find((m) => m.value === cap)
    return media ? `${group.label} · ${media.label}` : group.label
  }
  return group.label
}

export function getVisionMediaLabel(cap: 'image' | 'video'): string {
  return VISION_MEDIA_TYPES.find((m) => m.value === cap)?.label ?? cap
}

export { PROVIDER_LABELS } from './providers'
