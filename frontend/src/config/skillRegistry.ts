import { CREATIVE_SKILLS, type CreativeSkill } from './creativeSkills'
import { DEFAULT_SKILLS } from './defaults'
import type { SkillConfig, SkillId } from '../types/agent'

/** 可插拔技能模块（核心能力 + 创作插件） */
export interface SkillModule {
  id: string
  kind: 'core' | 'plugin'
  name: string
  description: string
  /** 关联核心 SkillId（插件用于 image/video 前缀） */
  capability?: SkillId
  promptHint?: string
  modes?: ('image' | 'video')[]
  icon?: string
  enabled?: boolean
}

const coreModules: SkillModule[] = DEFAULT_SKILLS.map((s: SkillConfig) => ({
  id: s.id,
  kind: 'core' as const,
  name: s.name,
  description: s.description,
  capability: s.id,
  icon: s.icon,
  enabled: s.enabled,
}))

const pluginModules: SkillModule[] = CREATIVE_SKILLS.map((s: CreativeSkill) => ({
  id: s.id,
  kind: 'plugin' as const,
  name: s.name,
  description: s.description,
  capability: s.modes[0] === 'video' ? 'video' : 'image',
  promptHint: s.promptHint,
  modes: s.modes,
}))

export const SKILL_REGISTRY: SkillModule[] = [...coreModules, ...pluginModules]

export function getSkillModule(id: string) {
  return SKILL_REGISTRY.find((m) => m.id === id)
}

export function listCoreSkills() {
  return SKILL_REGISTRY.filter((m) => m.kind === 'core')
}

export function listPluginSkills(enabledIds?: string[]) {
  const plugins = SKILL_REGISTRY.filter((m) => m.kind === 'plugin')
  if (!enabledIds?.length) return plugins
  return plugins.filter((p) => enabledIds.includes(p.id))
}

/** 创作插件仍从 CREATIVE_SKILLS 读取，保持与现有 UI 一致 */
export { CREATIVE_SKILLS }
