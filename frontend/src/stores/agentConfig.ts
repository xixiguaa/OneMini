import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  buildDefaultAgentConfig,
  DEFAULT_SKELETON,
  DEFAULT_WORKSPACE,
} from '../config/agentConfigDefaults'
import type {
  AgentConfigBundle,
  AgentWorkspace,
  OneMiniSkeleton,
  WorkspaceFileKey,
} from '../types/agentConfig'

const STORAGE_KEY = 'onemini-agent-config-v1'

function mergeSkeleton(saved?: Partial<OneMiniSkeleton>): OneMiniSkeleton {
  const base = structuredClone(DEFAULT_SKELETON)
  if (!saved) return base
  return {
    ...base,
    ...saved,
    models: { ...base.models, ...saved.models },
    session: { ...base.session, ...saved.session },
    sandbox: { ...base.sandbox, ...saved.sandbox },
    skills: { ...base.skills, ...saved.skills },
    multiAgent: {
      ...base.multiAgent,
      ...saved.multiAgent,
      orchestrator: { ...base.multiAgent.orchestrator, ...saved.multiAgent?.orchestrator },
      agents: saved.multiAgent?.agents?.length
        ? saved.multiAgent.agents
        : base.multiAgent.agents,
    },
  }
}

function mergeWorkspace(saved?: Partial<AgentWorkspace>): AgentWorkspace {
  return {
    agents: saved?.agents ?? DEFAULT_WORKSPACE.agents,
    soul: saved?.soul ?? DEFAULT_WORKSPACE.soul,
    identity: saved?.identity ?? DEFAULT_WORKSPACE.identity,
    user: saved?.user ?? DEFAULT_WORKSPACE.user,
    tools: saved?.tools ?? DEFAULT_WORKSPACE.tools,
  }
}

function loadBundle(): AgentConfigBundle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AgentConfigBundle> & {
        layers?: AgentWorkspace
      }
      const workspace = mergeWorkspace(parsed.workspace ?? parsed.layers)
      return {
        workspace,
        skeleton: mergeSkeleton(parsed.skeleton),
      }
    }
  } catch {
    /* ignore */
  }
  return buildDefaultAgentConfig()
}

export const useAgentConfigStore = defineStore('agentConfig', () => {
  const bundle = ref<AgentConfigBundle>(loadBundle())

  watch(
    bundle,
    (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
    { deep: true },
  )

  const skeleton = computed(() => bundle.value.skeleton)
  const workspace = computed(() => bundle.value.workspace)
  /** @deprecated 使用 workspace */
  const layers = workspace
  const multiAgentEnabled = computed(() => skeleton.value.multiAgent.enabled)
  const temperature = computed(() => skeleton.value.models.temperature)
  const maxHistory = computed(() => skeleton.value.session.maxHistoryMessages)
  const bootstrapMaxChars = computed(
    () => skeleton.value.bootstrapMaxChars ?? 18000,
  )

  function updateWorkspaceFile(key: WorkspaceFileKey, content: string) {
    bundle.value.workspace[key] = content
  }

  /** @deprecated */
  function updateLayer(key: WorkspaceFileKey, content: string) {
    updateWorkspaceFile(key, content)
  }

  function updateSkeleton(patch: Partial<OneMiniSkeleton>) {
    bundle.value.skeleton = mergeSkeleton({ ...bundle.value.skeleton, ...patch })
  }

  function resetWorkspace() {
    bundle.value.workspace = { ...DEFAULT_WORKSPACE }
  }

  /** @deprecated */
  function resetLayers() {
    resetWorkspace()
  }

  function resetSkeleton() {
    bundle.value.skeleton = structuredClone(DEFAULT_SKELETON)
  }

  function resetAll() {
    bundle.value = buildDefaultAgentConfig()
  }

  function isSkillAllowed(skillId: string): boolean {
    const allowed = skeleton.value.sandbox.allowedSkills
    return allowed.includes(skillId as (typeof allowed)[number])
  }

  function isPluginEnabled(pluginId: string): boolean {
    return skeleton.value.skills.plugins.includes(pluginId)
  }

  function togglePlugin(pluginId: string, on: boolean) {
    const list = [...skeleton.value.skills.plugins]
    const idx = list.indexOf(pluginId)
    if (on && idx < 0) list.push(pluginId)
    if (!on && idx >= 0) list.splice(idx, 1)
    bundle.value.skeleton.skills.plugins = list
  }

  return {
    bundle,
    skeleton,
    workspace,
    layers,
    multiAgentEnabled,
    temperature,
    maxHistory,
    bootstrapMaxChars,
    updateWorkspaceFile,
    updateLayer,
    updateSkeleton,
    resetWorkspace,
    resetLayers,
    resetSkeleton,
    resetAll,
    isSkillAllowed,
    isPluginEnabled,
    togglePlugin,
  }
})
