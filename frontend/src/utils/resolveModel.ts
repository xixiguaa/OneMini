import type { ModelConfig } from '../types/agent'
import type { OneMiniSkeleton } from '../types/agentConfig'

/** 已启用且密钥就绪、可用于 API 调用的模型 */
export type ReadyModelConfig = ModelConfig & { enabled: true }

export function isModelReady(model: ModelConfig | undefined): model is ReadyModelConfig {
  if (!model?.enabled) return false
  if (model.provider === 'tencent') return true
  return !!model.secretConfigured
}

type ChatSettings = {
  getModel: (id: string) => ModelConfig | undefined
  getSkill: (id: 'chat') => { defaultModelId?: string } | undefined
  /** 语言 + 多模态，用于对话回退 */
  modelsForChat: () => ModelConfig[]
}

export type ChatModelResolveResult =
  | { ok: true; model: ModelConfig }
  | { ok: false; error: string }

/**
 * 对话模型：输入框所选优先且不可静默回退；
 * 仅当未选择或所选已删除时，才走骨架 primary → fallbacks → 首个可用。
 */
export function resolveChatModel(
  skeleton: OneMiniSkeleton,
  settings: ChatSettings,
): ChatModelResolveResult {
  const skill = settings.getSkill('chat')

  if (skill?.defaultModelId) {
    const selected = settings.getModel(skill.defaultModelId)
    if (selected) {
      if (isModelReady(selected)) return { ok: true, model: selected }
      return {
        ok: false,
        error: `当前选择的「${selected.name}」尚未配置 API Key 或未启用，请在「模型配置」中保存密钥并启用。`,
      }
    }
  }

  const candidates: string[] = []
  if (skeleton.models.primary) candidates.push(skeleton.models.primary)
  candidates.push(...skeleton.models.fallbacks)

  for (const id of candidates) {
    const m = settings.getModel(id)
    if (isModelReady(m)) return { ok: true, model: m }
  }

  const fallback = settings.modelsForChat().find(isModelReady)
  if (fallback) return { ok: true, model: fallback }

  return {
    ok: false,
    error: '请在「模型配置」填写对话模型 API Key，或在「配置中心 → 运行参数」设置主模型',
  }
}

/** @deprecated 使用 resolveChatModel，避免所选模型未就绪时被静默回退 */
export function resolveModelForChat(
  skeleton: OneMiniSkeleton,
  settings: ChatSettings,
): ModelConfig | null {
  const result = resolveChatModel(skeleton, settings)
  return result.ok ? result.model : null
}
