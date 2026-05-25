import type { SkillConfig } from '../types/agent'

export const DEFAULT_SKILLS: SkillConfig[] = [
  {
    id: 'chat',
    name: '文本对话',
    description: '支持上传图片与文档，类似 Claude',
    icon: 'MessageSquare',
    enabled: true,
    defaultModelId: 'deepseek-v4-pro',
    systemPrompt: '你是 OneMini，一位来自森林的 AI 助手。请结合用户上传的文件内容回答问题。',
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
  image: '图片生成',
  video: '视频生成',
  world: '世界生成',
}

export { PROVIDER_LABELS } from './providers'
