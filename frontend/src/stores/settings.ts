import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { buildDefaultModels, MODEL_CATALOG } from '../config/modelCatalog'
import { DEFAULT_SKILLS } from '../config/defaults'
import type {
  AgentSettings,
  GenerationPrefs,
  ModelCapability,
  ModelConfig,
  SkillConfig,
  SkillId,
} from '../types/agent'
import { DEFAULT_GENERATION_PREFS } from '../types/agent'

const STORAGE_KEY = 'aji-agent-settings'

function mergeModelsWithCatalog(saved?: ModelConfig[]): ModelConfig[] {
  const defaults = buildDefaultModels()
  const savedMap = new Map((saved ?? []).map((m) => [m.id, m]))

  return defaults.map((def) => {
    const s = savedMap.get(def.id)
    if (s) {
      return {
        ...def,
        apiKey: s.apiKey ?? '',
        baseUrl: s.baseUrl ?? def.baseUrl,
        enabled: s.enabled ?? false,
        name: s.name || def.name,
      }
    }
    return def
  }).concat(
    (saved ?? []).filter((m) => !MODEL_CATALOG.some((c) => c.id === m.id)),
  )
}

function mergeSkills(saved?: SkillConfig[]): SkillConfig[] {
  const map = new Map(DEFAULT_SKILLS.map((s) => [s.id, { ...s }]))
  saved?.forEach((s) => {
    if (map.has(s.id)) map.set(s.id, { ...map.get(s.id)!, ...s })
  })
  return Array.from(map.values())
}

function loadSettings(): AgentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AgentSettings
      return {
        models: mergeModelsWithCatalog(parsed.models),
        skills: mergeSkills(parsed.skills),
        generationPrefs: { ...DEFAULT_GENERATION_PREFS, ...parsed.generationPrefs },
      }
    }
  } catch {
    /* ignore */
  }
  return {
    models: buildDefaultModels(),
    skills: [...DEFAULT_SKILLS],
    generationPrefs: { ...DEFAULT_GENERATION_PREFS },
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AgentSettings>(loadSettings())

  watch(
    settings,
    (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)),
    { deep: true },
  )

  const enabledSkills = computed(() => settings.value.skills.filter((s) => s.enabled))

  function modelsByCapability(cap: ModelCapability) {
    return settings.value.models.filter((m) => m.enabled && m.capability === cap)
  }

  const chatModels = computed(() => modelsByCapability('chat'))
  const imageModels = computed(() => modelsByCapability('image'))
  const videoModels = computed(() => modelsByCapability('video'))
  const worldModels = computed(() => modelsByCapability('world'))

  function getSkill(id: SkillId) {
    return settings.value.skills.find((s) => s.id === id)
  }

  function getModel(id: string) {
    return settings.value.models.find((m) => m.id === id)
  }

  function updateModel(id: string, patch: Partial<ModelConfig>) {
    const m = settings.value.models.find((x) => x.id === id)
    if (m) Object.assign(m, patch)
  }

  /** 仅保存密钥，不自动启用 */
  function setModelApiKey(id: string, apiKey: string) {
    updateModel(id, {
      apiKey: apiKey.trim(),
      enabled: false,
    })
  }

  function enableModel(id: string) {
    const m = getModel(id)
    if (!m) return false
    if (m.provider === 'tencent' || m.apiKey?.trim()) {
      updateModel(id, { enabled: true })
      return true
    }
    return false
  }

  /** 停用并清除密钥，需重新配置 */
  function disableModel(id: string) {
    updateModel(id, { apiKey: '', enabled: false })
  }

  /** 取消未启用的密钥配置 */
  function revokeModelApiKey(id: string) {
    updateModel(id, { apiKey: '', enabled: false })
  }

  function updateGenerationPrefs(patch: Partial<GenerationPrefs>) {
    Object.assign(settings.value.generationPrefs, patch)
  }

  function addCustomModel(model: Omit<ModelConfig, 'id' | 'preset'> & { id?: string }) {
    const id = model.id || `custom-${Date.now()}`
    if (settings.value.models.some((m) => m.id === id)) throw new Error('模型 ID 已存在')
    settings.value.models.push({
      ...model,
      id,
      preset: false,
      enabled: model.enabled ?? false,
    })
    return id
  }

  function removeModel(id: string) {
    const m = settings.value.models.find((x) => x.id === id)
    if (m?.preset) {
      updateModel(id, { apiKey: '', enabled: false })
      return
    }
    settings.value.models = settings.value.models.filter((m) => m.id !== id)
    settings.value.skills.forEach((s) => {
      if (s.defaultModelId === id) s.defaultModelId = ''
    })
  }

  function updateSkill(id: SkillId, patch: Partial<SkillConfig>) {
    const s = settings.value.skills.find((x) => x.id === id)
    if (s) Object.assign(s, patch)
  }

  function resetSkillsToDefaults() {
    settings.value.skills = [...DEFAULT_SKILLS]
  }

  function hasApiKey(modelId: string) {
    const m = getModel(modelId)
    if (!m || !m.enabled) return false
    return !!m.apiKey?.trim() || m.provider === 'tencent'
  }

  return {
    settings,
    enabledSkills,
    chatModels,
    imageModels,
    videoModels,
    worldModels,
    modelsByCapability,
    getSkill,
    getModel,
    updateModel,
    setModelApiKey,
    enableModel,
    disableModel,
    revokeModelApiKey,
    addCustomModel,
    removeModel,
    updateSkill,
    resetSkillsToDefaults,
    updateGenerationPrefs,
    hasApiKey,
  }
})
