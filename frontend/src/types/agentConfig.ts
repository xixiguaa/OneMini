import type { SkillId } from './agent'

/** 第四层：运行时骨架（对标 openclaw.json） */
export interface OneMiniSkeleton {
  version: string
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

/** 前三层 Markdown 声明 */
export interface AgentLayers {
  agents: string
  soul: string
  identity: string
  user: string
}

export type AgentLayerKey = keyof AgentLayers

export const LAYER_LABELS: Record<AgentLayerKey, { title: string; subtitle: string }> = {
  agents: { title: '宪法 AGENTS.md', subtitle: '工作流程与行为规范' },
  soul: { title: '灵魂 SOUL.md', subtitle: '价值观与语气' },
  identity: { title: '身份 IDENTITY.md', subtitle: '角色定位与擅长领域' },
  user: { title: '人设 USER.md', subtitle: '用户画像与偏好' },
}

export interface AgentConfigBundle {
  layers: AgentLayers
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
