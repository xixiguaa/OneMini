import skeletonJson from '../../agent-config/onemini.json'
import agentsMd from '../../agent-config/AGENTS.md?raw'
import soulMd from '../../agent-config/SOUL.md?raw'
import identityMd from '../../agent-config/IDENTITY.md?raw'
import userMd from '../../agent-config/USER.md?raw'
import type { AgentConfigBundle, OneMiniSkeleton } from '../types/agentConfig'

export const DEFAULT_SKELETON = skeletonJson as OneMiniSkeleton

export const DEFAULT_LAYERS = {
  agents: agentsMd,
  soul: soulMd,
  identity: identityMd,
  user: userMd,
}

export function buildDefaultAgentConfig(): AgentConfigBundle {
  return {
    layers: { ...DEFAULT_LAYERS },
    skeleton: structuredClone(DEFAULT_SKELETON),
  }
}
