import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  buildDefaultAgentConfig,
  DEFAULT_SKELETON,
  DEFAULT_WORKSPACE,
} from '../config/agentConfigDefaults'
import {
  AGENT_PERSONA_TEMPLATES,
  buildDefaultPersonaForm,
  getPersonaTemplate,
} from '../config/agentPersonaTemplates'
import type {
  AgentConfigBundle,
  AgentWorkspace,
  OneMiniSkeleton,
  WorkspaceFileKey,
} from '../types/agentConfig'
import type { AgentPersonaForm } from '../types/agentPersona'
import {
  composeWorkspaceFromPersona,
  parsePersonaFromWorkspace,
} from '../utils/agentPersonaCompose'

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
    skills: {
      ...base.skills,
      ...saved.skills,
      invokeDescriptions: {
        ...(base.skills.invokeDescriptions ?? {}),
        ...(saved.skills?.invokeDescriptions ?? {}),
      },
      params: {
        ...(base.skills.params ?? {}),
        ...(saved.skills?.params ?? {}),
      },
      permissions: {
        ...(base.skills.permissions ?? {}),
        ...(saved.skills?.permissions ?? {}),
      },
      hiddenSkillIds: saved.skills?.hiddenSkillIds ?? base.skills.hiddenSkillIds ?? [],
    },
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

function resolvePersona(
  saved: Partial<AgentConfigBundle> & { layers?: AgentWorkspace },
  workspace: AgentWorkspace,
): AgentPersonaForm {
  if (saved.persona) return { ...saved.persona }
  return parsePersonaFromWorkspace(workspace, buildDefaultPersonaForm())
}

function loadBundle(): AgentConfigBundle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AgentConfigBundle> & {
        layers?: AgentWorkspace
      }
      const workspace = mergeWorkspace(parsed.workspace ?? parsed.layers)
      const persona = resolvePersona(parsed, workspace)
      return {
        workspace,
        skeleton: mergeSkeleton(parsed.skeleton),
        persona,
      }
    }
  } catch {
    /* ignore */
  }
  const defaults = buildDefaultAgentConfig()
  return {
    ...defaults,
    persona: buildDefaultPersonaForm(),
  }
}

function syncWorkspaceFromPersona(bundle: AgentConfigBundle) {
  if (!bundle.persona) return
  const next = composeWorkspaceFromPersona(bundle.persona, bundle.workspace)
  bundle.workspace = next
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
  const persona = computed(() => bundle.value.persona ?? buildDefaultPersonaForm())
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

  function updatePersona(patch: Partial<AgentPersonaForm>) {
    bundle.value.persona = { ...persona.value, ...patch }
    syncWorkspaceFromPersona(bundle.value)
  }

  function applyPersonaTemplate(templateId: string) {
    const t = getPersonaTemplate(templateId)
    bundle.value.persona = { templateId: t.id, ...t.persona }
    syncWorkspaceFromPersona(bundle.value)
  }

  function syncPersonaFromWorkspace() {
    bundle.value.persona = parsePersonaFromWorkspace(bundle.value.workspace, persona.value)
  }

  function updateSkeleton(patch: Partial<OneMiniSkeleton>) {
    bundle.value.skeleton = mergeSkeleton({ ...bundle.value.skeleton, ...patch })
  }

  function resetWorkspace() {
    bundle.value.workspace = { ...DEFAULT_WORKSPACE }
    bundle.value.persona = buildDefaultPersonaForm()
    syncWorkspaceFromPersona(bundle.value)
  }

  /** @deprecated */
  function resetLayers() {
    resetWorkspace()
  }

  function resetSkeleton() {
    bundle.value.skeleton = structuredClone(DEFAULT_SKELETON)
  }

  function resetAll() {
    bundle.value = {
      ...buildDefaultAgentConfig(),
      persona: buildDefaultPersonaForm(),
    }
    syncWorkspaceFromPersona(bundle.value)
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

  function getSkillInvokeDescription(skillId: string, fallback: string) {
    return skeleton.value.skills.invokeDescriptions?.[skillId]?.trim() || fallback
  }

  function setSkillInvokeDescription(skillId: string, text: string) {
    const invokeDescriptions = { ...(skeleton.value.skills.invokeDescriptions ?? {}) }
    invokeDescriptions[skillId] = text
    bundle.value.skeleton.skills = { ...skeleton.value.skills, invokeDescriptions }
  }

  function getSkillParams<T extends Record<string, unknown>>(skillId: string, defaults: T): T {
    const raw = skeleton.value.skills.params?.[skillId]
    return { ...defaults, ...(raw as Partial<T> | undefined) }
  }

  function setSkillParams(skillId: string, patch: Record<string, unknown>) {
    const params = { ...(skeleton.value.skills.params ?? {}) }
    params[skillId] = { ...(params[skillId] ?? {}), ...patch }
    bundle.value.skeleton.skills = { ...skeleton.value.skills, params }
  }

  function getSkillPermission(skillId: string, permId: string, defaultOn: boolean) {
    return skeleton.value.skills.permissions?.[skillId]?.[permId] ?? defaultOn
  }

  function setSkillPermission(skillId: string, permId: string, on: boolean) {
    const permissions = { ...(skeleton.value.skills.permissions ?? {}) }
    permissions[skillId] = { ...(permissions[skillId] ?? {}), [permId]: on }
    bundle.value.skeleton.skills = { ...skeleton.value.skills, permissions }
  }

  function hideSkillId(skillId: string) {
    const hidden = new Set(skeleton.value.skills.hiddenSkillIds ?? [])
    hidden.add(skillId)
    bundle.value.skeleton.skills = {
      ...skeleton.value.skills,
      hiddenSkillIds: [...hidden],
    }
  }

  function isSkillHidden(skillId: string) {
    return (skeleton.value.skills.hiddenSkillIds ?? []).includes(skillId)
  }

  return {
    bundle,
    skeleton,
    workspace,
    persona,
    layers,
    multiAgentEnabled,
    temperature,
    maxHistory,
    bootstrapMaxChars,
    personaTemplates: AGENT_PERSONA_TEMPLATES,
    updateWorkspaceFile,
    updateLayer,
    updatePersona,
    applyPersonaTemplate,
    syncPersonaFromWorkspace,
    updateSkeleton,
    resetWorkspace,
    resetLayers,
    resetSkeleton,
    resetAll,
    isSkillAllowed,
    isPluginEnabled,
    togglePlugin,
    getSkillInvokeDescription,
    setSkillInvokeDescription,
    getSkillParams,
    setSkillParams,
    getSkillPermission,
    setSkillPermission,
    hideSkillId,
    isSkillHidden,
  }
})
