import type { ModelConfig } from '../types/agent'
import type { OneMiniSkeleton } from '../types/agentConfig'

function isModelReady(model: ModelConfig | undefined): model is ModelConfig {
  if (!model?.enabled) return false
  if (model.provider === 'tencent') return true
  return !!model.apiKey?.trim()
}

/** 按骨架 primary → fallbacks → 技能绑定 → 同能力首个可用 解析模型 */
export function resolveModelForChat(
  skeleton: OneMiniSkeleton,
  settings: {
    getModel: (id: string) => ModelConfig | undefined
    getSkill: (id: 'chat') => { defaultModelId?: string } | undefined
    modelsByCapability: (cap: 'chat') => ModelConfig[]
  },
  skillId: 'chat' = 'chat',
): ModelConfig | null {
  const candidates: string[] = []
  if (skeleton.models.primary) candidates.push(skeleton.models.primary)
  candidates.push(...skeleton.models.fallbacks)

  const skill = settings.getSkill(skillId)
  if (skill?.defaultModelId) candidates.push(skill.defaultModelId)

  for (const id of candidates) {
    const m = settings.getModel(id)
    if (isModelReady(m)) return m
  }

  const fallback = settings.modelsByCapability('chat').find(isModelReady)
  return fallback ?? null
}
