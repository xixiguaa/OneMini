import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { deleteModelSecret, fetchSecretStatuses, saveModelSecret as saveModelSecretApi } from '../api/secrets'
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
import {
  ASPECT_RATIOS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
} from '../config/constants'

const STORAGE_KEY = 'aji-agent-settings'
const IMAGE_ASPECT_DEFAULT_MIGRATION_KEY = 'onemini-image-aspect-default-1x1'

const ASPECT_RATIO_IDS = new Set(ASPECT_RATIOS.map((r) => r.id))
const VIDEO_RESOLUTION_IDS = new Set(VIDEO_RESOLUTIONS.map((r) => r.id))
const VIDEO_ASPECT_RATIO_IDS = new Set(VIDEO_ASPECT_RATIOS.map((r) => r.id))

function applyImageAspectDefaultMigration(prefs: GenerationPrefs): GenerationPrefs {
  try {
    if (localStorage.getItem(IMAGE_ASPECT_DEFAULT_MIGRATION_KEY) === '1') return prefs
    localStorage.setItem(IMAGE_ASPECT_DEFAULT_MIGRATION_KEY, '1')
    return { ...prefs, aspectRatio: '1:1' }
  } catch {
    return prefs
  }
}

function normalizeGenerationPrefs(prefs?: Partial<GenerationPrefs>): GenerationPrefs {
  const merged: GenerationPrefs = { ...DEFAULT_GENERATION_PREFS, ...prefs }
  if (merged.aspectRatio === 'smart' || !ASPECT_RATIO_IDS.has(merged.aspectRatio)) {
    merged.aspectRatio = DEFAULT_GENERATION_PREFS.aspectRatio
  }
  if (!VIDEO_RESOLUTION_IDS.has(merged.videoResolution)) {
    merged.videoResolution = DEFAULT_GENERATION_PREFS.videoResolution
  }
  if (!VIDEO_ASPECT_RATIO_IDS.has(merged.videoAspectRatio)) {
    merged.videoAspectRatio = DEFAULT_GENERATION_PREFS.videoAspectRatio
  }
  return merged
}

function stripLegacyApiKeys(models: ModelConfig[]): ModelConfig[] {
  return models.map((m) => {
    const raw = m as ModelConfig & { apiKey?: string }
    const { apiKey: _removed, ...rest } = raw
    return {
      ...rest,
      secretConfigured: rest.secretConfigured ?? false,
      secretHint: rest.secretHint,
    }
  })
}

function mergeModelsWithCatalog(saved?: ModelConfig[]): ModelConfig[] {
  const defaults = buildDefaultModels()
  const savedMap = new Map(stripLegacyApiKeys(saved ?? []).map((m) => [m.id, m]))

  return defaults
    .map((def) => {
      const s = savedMap.get(def.id)
      if (s) {
        const name =
          def.preset && s.name === 'DeepSeek' ? def.name : s.name || def.name
        let model = s.model || def.model
        // 旧版内置预设误用 deepseek-chat，走 Agent Plan 时会路由到错误模型
        if (def.id === 'deepseek-v4-pro' && model === 'deepseek-chat') {
          model = def.model
        }
        return {
          ...def,
          model,
          baseUrl: s.baseUrl ?? def.baseUrl,
          enabled: s.enabled ?? false,
          name,
          secretConfigured: s.secretConfigured ?? false,
          secretHint: s.secretHint,
        }
      }
      return def
    })
    .concat(
      stripLegacyApiKeys(saved ?? []).filter((m) => {
        if (MODEL_CATALOG.some((c) => c.id === m.id)) return false
        // 已移除的旧内置对话预设不保留
        if (m.preset && m.capability === 'chat') return false
        return true
      }),
    )
}

function mergeSkills(saved?: SkillConfig[], modelIds?: Set<string>): SkillConfig[] {
  const map = new Map(DEFAULT_SKILLS.map((s) => [s.id, { ...s }]))
  const legacyChatPrompt =
    '你是 OneMini，一位来自森林的 AI 助手。请结合用户上传的文件内容回答问题。'
  saved?.forEach((s) => {
    if (map.has(s.id)) {
      const merged = { ...map.get(s.id)!, ...s }
      if (s.id === 'chat' && s.systemPrompt?.trim() === legacyChatPrompt) {
        merged.systemPrompt = DEFAULT_SKILLS.find((x) => x.id === 'chat')!.systemPrompt
      }
      map.set(s.id, merged)
    }
  })
  const skills = Array.from(map.values())
  if (modelIds) {
    for (const s of skills) {
      if (s.defaultModelId && !modelIds.has(s.defaultModelId)) {
        s.defaultModelId = s.id === 'chat' ? 'deepseek-v4-pro' : ''
      }
    }
  }
  return skills
}

function serializeForStorage(val: AgentSettings): AgentSettings {
  return {
    ...val,
    models: val.models.map((m) => {
      const { apiKey: _a, ...rest } = m as ModelConfig & { apiKey?: string }
      return rest
    }),
  }
}

function loadSettings(): AgentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AgentSettings
      const models = mergeModelsWithCatalog(parsed.models)
      const modelIds = new Set(models.map((m) => m.id))
      return {
        models,
        skills: mergeSkills(parsed.skills, modelIds),
        generationPrefs: applyImageAspectDefaultMigration(
          normalizeGenerationPrefs(parsed.generationPrefs),
        ),
      }
    }
  } catch {
    /* ignore */
  }
  const models = buildDefaultModels()
  return {
    models,
    skills: mergeSkills(undefined, new Set(models.map((m) => m.id))),
    generationPrefs: { ...DEFAULT_GENERATION_PREFS },
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AgentSettings>(loadSettings())
  const secretsHydrated = ref(false)

  watch(
    settings,
    (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeForStorage(val))),
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

  /** 将模型设为对应技能（对话/图片/视频/世界）的默认调用项 */
  function bindModelToSkill(modelId: string) {
    const m = getModel(modelId)
    if (!m) return
    const skillMap: Partial<Record<ModelCapability, SkillId>> = {
      chat: 'chat',
      image: 'image',
      video: 'video',
      world: 'world',
    }
    const skillId = skillMap[m.capability]
    if (skillId) updateSkill(skillId, { defaultModelId: modelId })
  }

  function getModel(id: string) {
    return settings.value.models.find((m) => m.id === id)
  }

  function updateModel(id: string, patch: Partial<ModelConfig>) {
    const m = settings.value.models.find((x) => x.id === id)
    if (m) Object.assign(m, patch)
  }

  async function hydrateSecretStatuses() {
    try {
      const statuses = await fetchSecretStatuses()
      const map = new Map(statuses.map((s) => [s.model_id, s]))
      for (const m of settings.value.models) {
        const st = map.get(m.id)
        m.secretConfigured = !!st?.configured
        m.secretHint = st?.hint
      }
      secretsHydrated.value = true
    } catch (e) {
      console.warn('[settings] 无法同步密钥状态（请确认 Python 后端已启动）', e)
    }
  }

  /** 将密钥保存到服务端保险库（不在前端留存明文） */
  async function saveModelSecret(id: string, apiKey: string) {
    const meta = await saveModelSecretApi(id, apiKey.trim())
    updateModel(id, {
      secretConfigured: true,
      secretHint: meta.hint,
      enabled: false,
    })
  }

  function enableModel(id: string) {
    const m = getModel(id)
    if (!m) return false
    if (m.provider === 'tencent' || m.secretConfigured) {
      updateModel(id, { enabled: true })
      return true
    }
    return false
  }

  async function disableModel(id: string) {
    const m = getModel(id)
    if (m?.secretConfigured && m.provider !== 'tencent') {
      try {
        await deleteModelSecret(id)
      } catch (e) {
        console.warn('[settings] 删除服务端密钥失败', e)
      }
    }
    updateModel(id, { secretConfigured: false, secretHint: undefined, enabled: false })
  }

  async function revokeModelApiKey(id: string) {
    await disableModel(id)
  }

  function updateGenerationPrefs(patch: Partial<GenerationPrefs>) {
    settings.value.generationPrefs = normalizeGenerationPrefs({
      ...settings.value.generationPrefs,
      ...patch,
    })
  }

  function addCustomModel(model: Omit<ModelConfig, 'id' | 'preset'> & { id?: string }) {
    const id = model.id || `custom-${Date.now()}`
    if (settings.value.models.some((m) => m.id === id)) throw new Error('模型 ID 已存在')
    settings.value.models.push({
      ...model,
      id,
      preset: false,
      enabled: model.enabled ?? false,
      secretConfigured: false,
    })
    return id
  }

  function canDeleteModel(id: string): boolean {
    const m = getModel(id)
    return !!m && !m.preset
  }

  /** 删除自定义模型（含服务端密钥）；内置预设不可删 */
  async function removeModel(id: string): Promise<boolean> {
    const m = getModel(id)
    if (!m || m.preset) return false
    try {
      await deleteModelSecret(id)
    } catch (e) {
      const is404 = axios.isAxiosError(e) && e.response?.status === 404
      if (!is404) {
        console.warn('[settings] 删除服务端密钥失败', e)
        return false
      }
    }
    settings.value.models = settings.value.models.filter((x) => x.id !== id)
    settings.value.skills.forEach((s) => {
      if (s.defaultModelId !== id) return
      s.defaultModelId = s.id === 'chat' ? 'deepseek-v4-pro' : ''
    })
    return true
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
    return !!m.secretConfigured || m.provider === 'tencent'
  }

  function modelHasSecret(model: ModelConfig | undefined) {
    if (!model) return false
    return model.provider === 'tencent' || !!model.secretConfigured
  }

  return {
    settings,
    secretsHydrated,
    enabledSkills,
    chatModels,
    imageModels,
    videoModels,
    worldModels,
    modelsByCapability,
    getSkill,
    getModel,
    bindModelToSkill,
    updateModel,
    hydrateSecretStatuses,
    saveModelSecret,
    enableModel,
    disableModel,
    revokeModelApiKey,
    addCustomModel,
    canDeleteModel,
    removeModel,
    updateSkill,
    resetSkillsToDefaults,
    updateGenerationPrefs,
    hasApiKey,
    modelHasSecret,
  }
})
