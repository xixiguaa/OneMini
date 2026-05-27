import { WORKSPACE_FILES, WORKSPACE_INJECT_ORDER } from '../config/workspaceFiles'
import type { AgentWorkspace } from '../types/agentConfig'
import type { ModelConfig } from '../types/agent'

const FILE_MAP = Object.fromEntries(
  WORKSPACE_FILES.map((f) => [f.key, f.filename]),
) as Record<keyof AgentWorkspace, string>

/** OpenClaw 顺序注入工作区 bootstrap 文件 */
export function composeSystemPrompt(
  workspace: AgentWorkspace,
  skillPrompt = '',
  specialistRole?: string,
  bootstrapMaxChars = 18000,
): string {
  const parts: string[] = []

  for (const key of WORKSPACE_INJECT_ORDER) {
    let body = workspace[key]?.trim()
    if (!body) continue
    if (body.length > bootstrapMaxChars) {
      body = `${body.slice(0, bootstrapMaxChars)}\n\n…（已截断，完整内容见 ${FILE_MAP[key]}）`
    }
    parts.push(`<!-- ${FILE_MAP[key]} -->\n${body}`)
  }

  if (specialistRole?.trim()) {
    parts.push(`<!-- CREW ROLE -->\n${specialistRole.trim()}`)
  }

  const skill = skillPrompt.trim()
  if (skill) parts.push(`<!-- SKILL -->\n${skill}`)

  return parts.join('\n\n')
}

export function truncateHistory<T>(items: T[], max: number): T[] {
  if (max <= 0) return items
  return items.slice(-max)
}

/** 标明本条回复实际调用的模型（优先于骨架 primary/fallback 配置） */
export function formatRuntimeModelHint(model: Pick<ModelConfig, 'name' | 'provider' | 'model'>): string {
  return (
    '【运行时模型】本条回复实际调用：' +
    `${model.name}（provider=${model.provider}, model=${model.model}）。` +
    '输入框所选模型优先于 Agent 骨架中的 primary/fallback；向用户说明当前模型时仅依据本段。'
  )
}
