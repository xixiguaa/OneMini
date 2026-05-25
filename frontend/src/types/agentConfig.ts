import type { SkillId } from './agent'

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

export const CONFIG_SECTIONS: { id: AgentConfigSection; label: string; desc: string }[] = [
  {
    id: 'workspace',
    label: '工作区',
    desc: 'AGENTS / SOUL / USER … 注入系统提示',
  },
  {
    id: 'runtime',
    label: '运行时',
    desc: 'onemini.json · 模型 / 会话 / 沙箱',
  },
  {
    id: 'skills',
    label: '技能',
    desc: '能力与创作插件 · 绑定模型',
  },
  {
    id: 'crew',
    label: '协作团队',
    desc: '多 Agent 编排（Crew）',
  },
]
