import skeletonJson from '../../agent-config/onemini.json'
import agentsMd from '../../agent-config/AGENTS.md?raw'
import soulMd from '../../agent-config/SOUL.md?raw'
import identityMd from '../../agent-config/IDENTITY.md?raw'
import userMd from '../../agent-config/USER.md?raw'
import toolsMd from '../../agent-config/TOOLS.md?raw'
import { WORKSPACE_ROOT } from './workspaceFiles'
import type { AgentConfigBundle, AgentWorkspace, OneMiniSkeleton } from '../types/agentConfig'

export const DEFAULT_SKELETON: OneMiniSkeleton = {
  ...(skeletonJson as OneMiniSkeleton),
  workspace: WORKSPACE_ROOT,
  bootstrapMaxChars: 18000,
}

export const DEFAULT_WORKSPACE: AgentWorkspace = {
  agents: agentsMd,
  soul: soulMd,
  identity: identityMd,
  user: userMd,
  tools: toolsMd,
}

/** @deprecated */
export const DEFAULT_LAYERS = DEFAULT_WORKSPACE

export function buildDefaultAgentConfig(): AgentConfigBundle {
  return {
    workspace: { ...DEFAULT_WORKSPACE },
    skeleton: structuredClone(DEFAULT_SKELETON),
  }
}
