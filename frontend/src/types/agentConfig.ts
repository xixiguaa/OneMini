import type { SkillId } from './agent'
import type { AgentPersonaForm } from './agentPersona'

/** 工作区 Markdown（对标 OpenClaw workspace bootstrap files） */
export interface AgentWorkspace {
  agents: string
  soul: string
  identity: string
  user: string
  tools: string
}

export type WorkspaceFileKey = keyof AgentWorkspace

/** @deprecated 兼容旧代码别名 */
export type AgentLayerKey = WorkspaceFileKey
export type AgentLayers = AgentWorkspace

/** 运行时配置（对标 openclaw.json，勿重复 AGENTS 里的策略条文） */
export interface OneMiniSkeleton {
  version: string
  workspace?: string
  bootstrapMaxChars?: number
  models: {
    primary: string
    fallbacks: string[]
    temperature: number
    maxTokens?: number
  }
  session: {
    maxHistoryMessages: number
    dailyReset: boolean
  }
  sandbox: {
    mode: 'off' | 'warn' | 'strict'
    allowedSkills: SkillId[]
  }
  skills: {
    plugins: string[]
    /** 各技能调用条件描述（对应 LLM tool description） */
    invokeDescriptions?: Record<string, string>
    /** 技能参数，如联网搜索条数、域名黑名单 */
    params?: Record<string, Record<string, unknown>>
    /** 技能子权限开关 */
    permissions?: Record<string, Record<string, boolean>>
    /** 在技能管理页隐藏的技能 ID */
    hiddenSkillIds?: string[]
  }
  multiAgent: MultiAgentConfig
}

export interface SpecialistAgent {
  id: string
  name: string
  role: string
  skillIds: SkillId[]
  temperature?: number
  systemPrompt?: string
}

export interface MultiAgentConfig {
  enabled: boolean
  triggerKeywords: string[]
  minPromptLength: number
  orchestrator: {
    id: string
    name: string
    role: string
    temperature?: number
  }
  agents: SpecialistAgent[]
}

export interface AgentConfigBundle {
  workspace: AgentWorkspace
  /** @deprecated 读取时从 layers 迁移 */
  layers?: AgentWorkspace
  skeleton: OneMiniSkeleton
  /** 表单式人设；变更时同步写入 workspace Markdown */
  persona?: AgentPersonaForm
}

export interface OrchestrationStep {
  agentId: string
  task: string
}

export interface OrchestrationPlan {
  summary: string
  steps: OrchestrationStep[]
}

export interface OrchestrationResult {
  plan: OrchestrationPlan
  stepOutputs: { agentId: string; agentName: string; content: string }[]
  finalAnswer: string
}

export type AgentConfigSection = 'workspace' | 'runtime' | 'skills' | 'crew'

export const CONFIG_SECTIONS: { id: AgentConfigSection; label: string }[] = [
  { id: 'workspace', label: 'Agent 配置' },
  { id: 'runtime', label: '运行参数' },
  { id: 'skills', label: '技能' },
  { id: 'crew', label: '多 Agent 协作' },
]
