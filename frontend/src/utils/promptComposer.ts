import type { AgentLayers } from '../types/agentConfig'

const LAYER_HEADERS: Record<keyof AgentLayers, string> = {
  agents: '【宪法 · AGENTS】',
  soul: '【灵魂 · SOUL】',
  identity: '【身份 · IDENTITY】',
  user: '【人设 · USER】',
}

/** 按 OpenClaw 四层顺序合成系统提示词 */
export function composeSystemPrompt(
  layers: AgentLayers,
  skillPrompt = '',
  specialistRole?: string,
): string {
  const parts: string[] = []

  for (const key of ['agents', 'soul', 'identity', 'user'] as const) {
    const body = layers[key]?.trim()
    if (body) parts.push(`${LAYER_HEADERS[key]}\n${body}`)
  }

  if (specialistRole?.trim()) {
    parts.push(`【多智能体角色】\n${specialistRole.trim()}`)
  }

  const skill = skillPrompt.trim()
  if (skill) parts.push(`【当前技能】\n${skill}`)

  return parts.join('\n\n')
}

export function truncateHistory<T>(items: T[], max: number): T[] {
  if (max <= 0) return items
  return items.slice(-max)
}
