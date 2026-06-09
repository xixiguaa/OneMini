import type { AgentConfigBundle } from './agentConfig'

export const DEFAULT_USER_AGENT_ID = 'default'

export interface UserAgent {
  id: string
  name: string
  description: string
  /** 侧栏与列表展示用，对应 agentAvatars 中的图片 id */
  avatar: string
  bundle: AgentConfigBundle
  createdAt: number
  updatedAt: number
}

export interface UserAgentsState {
  agents: UserAgent[]
  activeAgentId: string
}

export type AgentConfigTab = 'config' | 'store'
