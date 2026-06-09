import chefImg from '../assets/img/agent/厨师.png'
import doctorImg from '../assets/img/agent/医生.png'
import generalImg from '../assets/img/agent/通用.png'
import lawyerImg from '../assets/img/agent/律师.png'

export interface AgentAvatarOption {
  id: string
  label: string
  src: string
}

export const AGENT_AVATAR_OPTIONS: AgentAvatarOption[] = [
  { id: 'general', label: '通用', src: generalImg },
  { id: 'doctor', label: '医生', src: doctorImg },
  { id: 'lawyer', label: '律师', src: lawyerImg },
  { id: 'chef', label: '厨师', src: chefImg },
]

const AVATAR_BY_ID = Object.fromEntries(AGENT_AVATAR_OPTIONS.map((o) => [o.id, o])) as Record<
  string,
  AgentAvatarOption
>

export const DEFAULT_AGENT_AVATAR_ID = 'general'

export function resolveAgentAvatarSrc(avatar?: string): string | null {
  if (!avatar?.trim()) return null
  return AVATAR_BY_ID[avatar.trim()]?.src ?? null
}

/** 将旧版 emoji 头像迁移为图片 id */
export function normalizeAgentAvatarId(avatar?: string, index = 0): string {
  if (!avatar?.trim()) return pickDefaultAvatarId(index)
  const id = avatar.trim()
  if (AVATAR_BY_ID[id]) return id
  return pickDefaultAvatarId(index)
}

export function pickDefaultAvatarId(index: number): string {
  return AGENT_AVATAR_OPTIONS[index % AGENT_AVATAR_OPTIONS.length]!.id
}
