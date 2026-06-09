import { defineStore } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'
import { buildDefaultAgentConfig } from '../config/agentConfigDefaults'
import {
  AGENT_PERSONA_TEMPLATES,
  buildDefaultPersonaForm,
  getPersonaTemplate,
} from '../config/agentPersonaTemplates'
import type { AgentConfigBundle } from '../types/agentConfig'
import {
  DEFAULT_USER_AGENT_ID,
  type UserAgent,
  type UserAgentsState,
} from '../types/userAgent'
import { randomUUID } from '../utils/uuid'

const STORAGE_KEY = 'onemini-user-agents-v1'
const LEGACY_CONFIG_KEY = 'onemini-agent-config-v1'

const AGENT_AVATARS = ['🤖', '✨', '🎯', '💡', '🦊', '🐱', '🎨', '📚', '🛠️', '🌟']

function pickAvatar(name: string, index: number): string {
  const trimmed = name.trim()
  if (trimmed && /\p{Extended_Pictographic}/u.test(trimmed[0]!)) return trimmed[0]!
  return AGENT_AVATARS[index % AGENT_AVATARS.length]!
}

function normalizeBundle(bundle?: Partial<AgentConfigBundle>): AgentConfigBundle {
  const src = bundle ? (toRaw(bundle) as Partial<AgentConfigBundle>) : undefined
  const defaults = buildDefaultAgentConfig()
  const persona = src?.persona
    ? { ...buildDefaultPersonaForm(), ...src.persona }
    : buildDefaultPersonaForm()
  return {
    workspace: {
      agents: src?.workspace?.agents ?? defaults.workspace.agents,
      soul: src?.workspace?.soul ?? defaults.workspace.soul,
      identity: src?.workspace?.identity ?? defaults.workspace.identity,
      user: src?.workspace?.user ?? defaults.workspace.user,
      tools: src?.workspace?.tools ?? defaults.workspace.tools,
    },
    skeleton: {
      ...defaults.skeleton,
      ...(src?.skeleton ?? {}),
      models: { ...defaults.skeleton.models, ...(src?.skeleton?.models ?? {}) },
      session: { ...defaults.skeleton.session, ...(src?.skeleton?.session ?? {}) },
      sandbox: { ...defaults.skeleton.sandbox, ...(src?.skeleton?.sandbox ?? {}) },
      skills: {
        ...defaults.skeleton.skills,
        ...(src?.skeleton?.skills ?? {}),
      },
      multiAgent: {
        ...defaults.skeleton.multiAgent,
        ...(src?.skeleton?.multiAgent ?? {}),
      },
    },
    persona,
  }
}

function cloneBundle(bundle?: Partial<AgentConfigBundle>): AgentConfigBundle {
  return normalizeBundle(bundle)
}

/** 从 Pinia reactive 状态安全拷贝配置（避免 structuredClone 报错） */
export function cloneAgentConfigBundle(bundle?: Partial<AgentConfigBundle>): AgentConfigBundle {
  return cloneBundle(bundle)
}

function buildDefaultAgent(name: string, bundle?: AgentConfigBundle, index = 0): UserAgent {
  const now = Date.now()
  const base = bundle ?? {
    ...buildDefaultAgentConfig(),
    persona: buildDefaultPersonaForm(),
  }
  return {
    id: DEFAULT_USER_AGENT_ID,
    name,
    description: base.persona?.tagline?.slice(0, 80) ?? '',
    avatar: pickAvatar(name, index),
    bundle: cloneBundle(base),
    createdAt: now,
    updatedAt: now,
  }
}

function loadLegacyBundle(): AgentConfigBundle | null {
  try {
    const raw = localStorage.getItem(LEGACY_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AgentConfigBundle>
    return {
      workspace: parsed.workspace ?? buildDefaultAgentConfig().workspace,
      skeleton: parsed.skeleton ?? buildDefaultAgentConfig().skeleton,
      persona: parsed.persona ?? buildDefaultPersonaForm(),
    }
  } catch {
    return null
  }
}

function loadState(): UserAgentsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as UserAgentsState
      if (parsed.agents?.length) {
        return {
          agents: parsed.agents.map((a, index) => ({
            ...a,
            name: a.name?.trim() || '未命名智能体',
            avatar: a.avatar || pickAvatar(a.name || '智能体', index),
            bundle: cloneBundle(a.bundle),
          })),
          activeAgentId: parsed.activeAgentId || parsed.agents[0]!.id,
        }
      }
    }
  } catch {
    /* ignore */
  }

  const legacy = loadLegacyBundle()
  const defaultAgent = buildDefaultAgent(
    legacy?.persona?.name?.trim() || 'OneMini',
    legacy ?? undefined,
  )
  return {
    agents: [defaultAgent],
    activeAgentId: DEFAULT_USER_AGENT_ID,
  }
}

export const useUserAgentsStore = defineStore('userAgents', () => {
  const initial = loadState()
  const agents = ref<UserAgent[]>(initial.agents)
  const activeAgentId = ref(initial.activeAgentId)

  watch(
    [agents, activeAgentId],
    () => {
      const payload: UserAgentsState = {
        agents: agents.value,
        activeAgentId: activeAgentId.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    },
    { deep: true },
  )

  const activeAgent = computed(
    () => agents.value.find((a) => a.id === activeAgentId.value) ?? agents.value[0] ?? null,
  )

  const sortedAgents = computed(() =>
    [...agents.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  function getAgent(id: string): UserAgent | undefined {
    return agents.value.find((a) => a.id === id)
  }

  function selectAgent(id: string) {
    if (!getAgent(id)) return
    activeAgentId.value = id
  }

  function touchAgent(id: string) {
    const agent = getAgent(id)
    if (agent) agent.updatedAt = Date.now()
  }

  function replaceActiveBundle(bundle: AgentConfigBundle) {
    const agent = activeAgent.value
    if (!agent) return
    agent.bundle = cloneBundle(bundle)
    agent.name = bundle.persona?.name?.trim() || agent.name
    agent.description = bundle.persona?.tagline?.trim().slice(0, 120) || agent.description
    touchAgent(agent.id)
  }

  function createAgent(opts?: { name?: string; templateId?: string }): string {
    const id = randomUUID()
    const template = opts?.templateId ? getPersonaTemplate(opts.templateId) : null
    const bundle = buildDefaultAgentConfig()
    bundle.persona = template
      ? { templateId: template.id, ...template.persona }
      : buildDefaultPersonaForm()
    const name = opts?.name?.trim() || template?.name || '未命名智能体'
    const now = Date.now()
    agents.value.unshift({
      id,
      name,
      description: bundle.persona?.tagline?.slice(0, 120) ?? '',
      avatar: pickAvatar(name, agents.value.length),
      bundle: cloneBundle(bundle),
      createdAt: now,
      updatedAt: now,
    })
    activeAgentId.value = id
    return id
  }

  function duplicateAgent(id: string): string | null {
    const source = getAgent(id)
    if (!source) return null
    const newId = randomUUID()
    const now = Date.now()
    agents.value.unshift({
      id: newId,
      name: `${source.name} 副本`,
      description: source.description,
      avatar: pickAvatar(source.name, agents.value.length),
      bundle: cloneBundle(source.bundle),
      createdAt: now,
      updatedAt: now,
    })
    activeAgentId.value = newId
    return newId
  }

  function renameAgent(id: string, name: string) {
    const agent = getAgent(id)
    if (!agent) return
    agent.name = name.trim() || agent.name
    if (agent.bundle.persona) agent.bundle.persona.name = agent.name
    touchAgent(id)
  }

  function deleteAgent(id: string) {
    if (agents.value.length <= 1) return false
    const idx = agents.value.findIndex((a) => a.id === id)
    if (idx < 0) return false
    agents.value.splice(idx, 1)
    if (activeAgentId.value === id) {
      activeAgentId.value = agents.value[0]?.id ?? DEFAULT_USER_AGENT_ID
    }
    return true
  }

  return {
    agents,
    activeAgentId,
    activeAgent,
    sortedAgents,
    personaTemplates: AGENT_PERSONA_TEMPLATES,
    getAgent,
    selectAgent,
    touchAgent,
    replaceActiveBundle,
    createAgent,
    duplicateAgent,
    renameAgent,
    deleteAgent,
  }
})
