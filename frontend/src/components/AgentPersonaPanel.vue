<script setup lang="ts">
import {
  Brain,
  Cpu,
  Maximize2,
  RotateCcw,
  Sparkles,
  User,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchCustomSkillsApi, type CustomSkillPayload } from '../api/agent'
import { AGENT_SKILL_CATALOG } from '../config/agentSkillCatalog'
import PromptFullscreenModal from './PromptFullscreenModal.vue'
import { MODEL_PARAM_PRESETS } from '../config/modelParamPresets'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useSettingsStore } from '../stores/settings'
import { useUserAgentsStore } from '../stores/userAgents'
import { usePlatformStore } from '../stores/platform'
import { TONE_OPTIONS } from '../types/agentPersona'
import {
  buildIntroPreview,
  composeSystemPromptPreview,
} from '../utils/agentPersonaCompose'
import { AGENT_AVATAR_OPTIONS, resolveAgentAvatarSrc } from '../config/agentAvatars'
import { optimizeSystemPrompt } from '../utils/promptOptimize'
import { isModelReady } from '../utils/resolveModel'

type ConfigTab = 'basic' | 'brain'

const agentConfig = useAgentConfigStore()
const userAgents = useUserAgentsStore()
const settings = useSettingsStore()
const platform = usePlatformStore()

const activeTab = ref<ConfigTab>('basic')
const promptModalOpen = ref(false)
const optimizing = ref(false)
const optimizeError = ref('')
const avatarPreviewOpen = ref(false)

const form = computed(() => agentConfig.persona)
const activeAgent = computed(() => userAgents.activeAgent)
const currentAvatarSrc = computed(() => resolveAgentAvatarSrc(activeAgent.value?.avatar))
const currentAvatarLabel = computed(
  () => AGENT_AVATAR_OPTIONS.find((o) => o.id === activeAgent.value?.avatar)?.label ?? '',
)
const introPreview = computed(() => buildIntroPreview(form.value))
const systemPromptPreview = computed(() => composeSystemPromptPreview(form.value))
const chatModels = computed(() => settings.chatModels.filter(isModelReady))
const temperature = computed(() => agentConfig.skeleton.models.temperature)

const configTabs: { id: ConfigTab; label: string; icon: typeof User }[] = [
  { id: 'basic', label: '基础设定', icon: User },
  { id: 'brain', label: '核心大脑', icon: Brain },
]

function patch(field: keyof typeof form.value, value: unknown) {
  agentConfig.updatePersona({ [field]: value } as Partial<typeof form.value>)
}

function pickTemplate(id: string) {
  agentConfig.applyPersonaTemplate(id)
}

function pickAvatar(avatarId: string) {
  if (!activeAgent.value) return
  userAgents.updateAgentAvatar(activeAgent.value.id, avatarId)
}

async function runOptimize(brief?: string) {
  optimizeError.value = ''
  optimizing.value = true
  try {
    const source = brief ?? (form.value.customInstructions || form.value.tagline)
    const result = await optimizeSystemPrompt(source, agentConfig.skeleton, settings)
    patch('promptOverride', result)
  } catch (e) {
    optimizeError.value = e instanceof Error ? e.message : '优化失败'
  } finally {
    optimizing.value = false
  }
}

function onPromptSave(value: string) {
  patch('promptOverride', value)
}



function onAvatarPreviewKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') avatarPreviewOpen.value = false
}

watch(avatarPreviewOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', onAvatarPreviewKeydown)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', onAvatarPreviewKeydown)
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onAvatarPreviewKeydown)
  if (avatarPreviewOpen.value) document.body.style.overflow = ''
})

const customSkillsList = ref<CustomSkillPayload[]>([])

async function fetchCustomSkills() {
  try {
    customSkillsList.value = await fetchCustomSkillsApi()
  } catch (e) {
    console.error('Failed to fetch custom skills for persona panel:', e)
  }
}

const localSkillItems = computed(() => {
  const list: any[] = []
  
  // 1. Built-in: web-search
  if (platform.webSearchEnabled) {
    const item = AGENT_SKILL_CATALOG.find((s) => s.id === 'web-search')
    if (item) list.push(item)
  }
  // 2. Built-in: knowledge-rag
  if (platform.knowledgeChatMode === 'rag') {
    const item = AGENT_SKILL_CATALOG.find((s) => s.id === 'knowledge-rag')
    if (item) list.push(item)
  }
  // 3. Built-in: knowledge-wiki
  if (platform.knowledgeChatMode === 'wiki') {
    const item = AGENT_SKILL_CATALOG.find((s) => s.id === 'knowledge-wiki')
    if (item) list.push(item)
  }

  // 4. Custom skills that are globally enabled
  for (const s of customSkillsList.value) {
    if (s.is_global_enabled) {
      list.push({
        id: s.id,
        name: s.name,
        description: s.description || '自定义技能包',
        icon: Cpu,
        iconTone: 'pink',
      })
    }
  }

  return list
})

function isLocalSkillEnabled(skillId: string) {
  return (agentConfig.skeleton.skills.enabledSkillIds ?? []).includes(skillId)
}

function toggleLocalSkill(skillId: string, on: boolean) {
  agentConfig.toggleLocalSkill(skillId, on)
}

onMounted(() => {
  void fetchCustomSkills()
})
</script>

<template>
  <div class="persona-panel">
    <div class="panel-toolbar">
      <div class="toolbar-main">
        <nav class="config-tabs" aria-label="配置分区">
          <button
            v-for="tab in configTabs"
            :key="tab.id"
            type="button"
            class="config-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" :size="14" />
            {{ tab.label }}
          </button>
        </nav>
      </div>
    </div>

    <div class="panel-body">
      <!-- 基础设定 -->
      <section v-show="activeTab === 'basic'" class="tab-panel">
        <article class="config-card">
          <header class="config-card__head config-card__head--row">
            <h3>角色模板</h3>
            <button type="button" class="reset-btn" @click="agentConfig.resetWorkspace()">
              <RotateCcw :size="14" />
              恢复默认
            </button>
          </header>
          <div class="template-chips">
            <button
              v-for="t in agentConfig.personaTemplates"
              :key="t.id"
              type="button"
              class="template-chip"
              :class="{ active: form.templateId === t.id }"
              @click="pickTemplate(t.id)"
            >
              {{ t.name }}
            </button>
          </div>
        </article>

        <article class="config-card">
          <header class="config-card__head">
            <h3>基础设定</h3>
          </header>
          <div class="basic-grid">
            <div class="avatar-block">
              <button
                v-if="currentAvatarSrc"
                type="button"
                class="avatar-display-btn"
                title="点击查看大图"
                @click="avatarPreviewOpen = true"
              >
                <img
                  class="avatar-display avatar-display--img"
                  :src="currentAvatarSrc"
                  :alt="activeAgent?.name ?? '角色头像'"
                />
              </button>
              <div class="avatar-picker">
                <button
                  v-for="opt in AGENT_AVATAR_OPTIONS"
                  :key="opt.id"
                  type="button"
                  class="avatar-opt"
                  :class="{ active: activeAgent?.avatar === opt.id }"
                  :title="opt.label"
                  @click="pickAvatar(opt.id)"
                >
                  <img :src="opt.src" :alt="opt.label" />
                </button>
              </div>
            </div>
            <div class="basic-fields">
              <label class="field">
                <span>助手名称</span>
                <input
                  class="input"
                  :value="form.name"
                  @input="patch('name', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="field">
                <span>一句话介绍</span>
                <textarea
                  class="input"
                  rows="2"
                  :value="form.tagline"
                  placeholder="例如：高 fantasy 小说设定专家"
                  @input="patch('tagline', ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
            </div>
          </div>
        </article>

        <article class="config-card">
          <header class="config-card__head">
            <h3>语气风格</h3>
          </header>
          <div class="tone-grid">
            <button
              v-for="opt in TONE_OPTIONS"
              :key="opt.id"
              type="button"
              class="tone-card"
              :class="{ active: form.tone === opt.id }"
              @click="patch('tone', opt.id)"
            >
              <span class="tone-label">{{ opt.label }}</span>
              <span class="tone-sample">{{ opt.sample }}</span>
            </button>
          </div>
        </article>

        <article class="config-card config-card--preview">
          <header class="config-card__head">
            <Sparkles :size="14" />
            <h3>预览</h3>
          </header>
          <div class="chat-bubble">{{ introPreview }}</div>
        </article>
      </section>

      <!-- 核心大脑 -->
      <section v-show="activeTab === 'brain'" class="tab-panel">
        <article class="config-card">
          <header class="config-card__head config-card__head--row">
            <h3>System Prompt</h3>
            <div class="prompt-actions">
              <button
                type="button"
                class="icon-btn"
                title="AI 优化扩写"
                :disabled="optimizing"
                @click="runOptimize()"
              >
                <Sparkles :size="14" />
                AI 优化
              </button>
              <button
                type="button"
                class="icon-btn"
                title="全屏编辑"
                @click="promptModalOpen = true"
              >
                <Maximize2 :size="14" />
                全屏
              </button>
            </div>
          </header>
          <p v-if="optimizeError" class="field-error">{{ optimizeError }}</p>
          <label class="field">
            <span>提示词概要</span>
            <textarea
              class="input input--prompt"
              rows="5"
              :value="form.customInstructions"
              placeholder="例如：你是一个高 fantasy 小说设定专家，擅长世界观、种族与魔法体系…"
              @input="patch('customInstructions', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
          <div v-if="form.promptOverride" class="override-badge">
            已启用自定义完整 Prompt（{{ form.promptOverride.length }} 字）
            <button type="button" @click="patch('promptOverride', '')">恢复自动生成</button>
          </div>
        </article>

        <article class="config-card">
          <header class="config-card__head">
            <h3>模型与参数</h3>
          </header>

          <label class="field">
            <span>主模型</span>
            <select
              class="input"
              :value="agentConfig.skeleton.models.primary || settings.getSkill('chat')?.defaultModelId || ''"
              @change="agentConfig.setPrimaryModel(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="m in chatModels" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
          </label>

          <div class="preset-row">
            <span class="preset-label">一键预设</span>
            <div class="preset-chips">
              <button
                v-for="p in MODEL_PARAM_PRESETS"
                :key="p.id"
                type="button"
                class="preset-chip"
                :title="p.description"
                @click="agentConfig.applyModelPreset(p)"
              >
                {{ p.label }}
              </button>
            </div>
          </div>

          <div class="slider-field">
            <div class="slider-head">
              <span>温度 Temperature</span>
              <span class="slider-value">{{ temperature.toFixed(2) }}</span>
            </div>
            <input
              type="range"
              class="glass-range"
              min="0"
              max="1"
              step="0.05"
              :value="temperature"
              @input="
                agentConfig.updateSkeleton({
                  models: {
                    ...agentConfig.skeleton.models,
                    temperature: Number(($event.target as HTMLInputElement).value),
                  },
                })
              "
            />
          </div>
        </article>


        <article class="config-card">
          <header class="config-card__head">
            <h3>智能体技能 (Agent Skills)</h3>
            <p>启用或禁用当前智能体的特定技能</p>
          </header>

          <div class="local-skills-list" v-if="localSkillItems.length > 0">
            <div
              v-for="item in localSkillItems"
              :key="item.id"
              class="local-skill-item"
            >
              <div class="local-skill-info">
                <span class="local-skill-icon" :class="`local-skill-icon--${item.iconTone || 'pink'}`">
                  <component :is="item.icon" :size="14" />
                </span>
                <div class="local-skill-details">
                  <div class="local-skill-name">{{ item.name }}</div>
                  <div class="local-skill-desc">{{ item.description }}</div>
                </div>
              </div>
              <label class="local-skill-toggle">
                <input
                  type="checkbox"
                  :checked="isLocalSkillEnabled(item.id)"
                  @change="toggleLocalSkill(item.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="switch" />
              </label>
            </div>
          </div>
          <div v-else class="local-skills-empty">
            没有全局启用的技能，请先在「技能商店」启用或添加技能。
          </div>
        </article>
      </section>
    </div>

    <PromptFullscreenModal
      :open="promptModalOpen"
      :model-value="systemPromptPreview"
      :optimizing="optimizing"
      @update:open="promptModalOpen = $event"
      @update:model-value="onPromptSave"
      @optimize="runOptimize(form.customInstructions || form.tagline)"
    />

    <Teleport to="body">
      <div
        v-if="avatarPreviewOpen && currentAvatarSrc"
        class="avatar-preview-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="角色头像预览"
        @click.self="avatarPreviewOpen = false"
      >
        <button
          type="button"
          class="avatar-preview-close"
          aria-label="关闭预览"
          @click="avatarPreviewOpen = false"
        >
          <X :size="20" />
        </button>
        <figure class="avatar-preview-figure">
          <img :src="currentAvatarSrc" :alt="currentAvatarLabel || activeAgent?.name || '角色头像'" />
          <figcaption v-if="currentAvatarLabel">{{ currentAvatarLabel }}</figcaption>
        </figure>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.persona-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  padding: 4px 14px 10px;
  border-bottom: 1px solid color-mix(in srgb, $border-light 55%, transparent);
  background: color-mix(in srgb, $bg-input 35%, transparent);
  flex-shrink: 0;
}

.toolbar-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.config-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-card) 75%, transparent);
  border: 1px solid color-mix(in srgb, $border-light 65%, transparent);
  flex-wrap: wrap;
}

.config-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  border: none;
  background: transparent;

  &:hover {
    color: $text-primary;
  }

  &.active {
    color: $accent-emphasis;
    background: var(--bg-card);
    box-shadow: $shadow-sm;
    font-weight: 600;
  }
}

.template-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.template-chip {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;

  &:hover {
    color: $text-primary;
    border-color: color-mix(in srgb, $accent 35%, transparent);
    background: color-mix(in srgb, var(--bg-card) 80%, transparent);
  }

  &.active {
    color: $accent-emphasis;
    background: color-mix(in srgb, $accent 10%, var(--bg-card));
    border-color: color-mix(in srgb, $accent 40%, transparent);
    font-weight: 600;
  }
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  color: $text-muted;
  border: none;
  background: transparent;
  flex-shrink: 0;

  &:hover {
    color: $color-danger;
    background: $color-danger-soft;
  }
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.config-card {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid $border-light;
  background: color-mix(in srgb, var(--bg-card) 90%, transparent);

  &--preview {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, $accent 6%, transparent),
      color-mix(in srgb, var(--bg-card) 92%, transparent)
    );
  }

  &--collapsible {
    padding: 0;
    overflow: hidden;
  }
}

.config-card__head {
  margin-bottom: 14px;

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
    margin: 0 0 4px;
  }

  p {
    margin: 0;
    font-size: 12px;
    color: $text-muted;
  }

  &--row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  &--summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    margin: 0;
    cursor: pointer;
    list-style: none;

    h3 {
      margin: 0;
    }

    &::-webkit-details-marker {
      display: none;
    }
  }
}

.config-card--collapsible[open] .collapse-chevron {
  transform: rotate(180deg);
}

.collapse-chevron {
  color: $text-muted;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.basic-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 16px;
  align-items: start;
}

.avatar-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.avatar-display-btn {
  position: relative;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 14px;

  &:hover .avatar-display--img {
    transform: scale(1.05);
  }
}

.avatar-display {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: $accent-light;
  border: 1px solid color-mix(in srgb, $accent 25%, transparent);
}

.avatar-display--img {
  display: block;
  object-fit: cover;
  transition: transform 0.18s ease;
}

.avatar-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, #1a1038 52%, transparent);
  backdrop-filter: blur(10px);
  animation: avatar-preview-in 0.2s ease;
}

.avatar-preview-close {
  position: absolute;
  top: 20px;
  right: 20px;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.avatar-preview-figure {
  margin: 0;
  text-align: center;

  img {
    display: block;
    max-width: min(280px, 78vw);
    max-height: min(280px, 68vh);
    border-radius: 24px;
    box-shadow: 0 24px 64px rgba(20, 12, 48, 0.35);
    object-fit: contain;
  }

  figcaption {
    margin-top: 12px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.88);
  }
}

@keyframes avatar-preview-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.avatar-picker {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  width: 72px;
}

.avatar-opt {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  border: 2px solid transparent;
  overflow: hidden;
  background: $bg-input;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:hover,
  &.active {
    border-color: color-mix(in srgb, $accent 45%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, $accent 20%, transparent);
  }
}

.basic-fields {
  min-width: 0;
}

.field {
  display: block;
  margin-bottom: 12px;

  > span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 6px;
  }
}

.field-row {
  display: flex;
  gap: 12px;
}

.field--half {
  flex: 1;
  min-width: 0;
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
  color: $text-primary;

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
    outline: none;
  }

  &--prompt {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.55;
  }
}

.field-error {
  font-size: 12px;
  color: $color-danger;
  margin: -6px 0 10px;
}

.tone-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.tone-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid $border-light;
  background: color-mix(in srgb, $bg-input 80%, transparent);
  text-align: left;

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 45%, transparent);
  }
}

.tone-label {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.tone-sample {
  font-size: 11px;
  color: $text-muted;
  line-height: 1.4;
}

.chat-bubble {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid $border-light;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.prompt-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
  color: $accent-emphasis;
  background: $accent-light;
  border: 1px solid color-mix(in srgb, $accent 25%, transparent);

  &:disabled {
    opacity: 0.6;
  }
}

.override-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  color: $accent-emphasis;
  background: $accent-light;
  border: 1px solid color-mix(in srgb, $accent 20%, transparent);

  button {
    font-size: 11px;
    text-decoration: underline;
    color: $text-secondary;
  }
}

.preset-row {
  margin-bottom: 16px;
}

.preset-label {
  display: block;
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-chip {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;

  &:hover {
    color: $accent-emphasis;
    border-color: color-mix(in srgb, $accent 35%, transparent);
    background: $accent-light;
  }
}

.slider-field {
  margin-top: 4px;
}

.slider-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.slider-value {
  font-weight: 600;
  color: $accent-emphasis;
  font-family: ui-monospace, monospace;
}

.knowledge-section {
  padding: 0 16px 16px;
}

.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.kb-tile {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid $border-light;
  background: $bg-input;
}

.kb-tile__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.kb-tile__icon {
  flex-shrink: 0;
}

.kb-tile__name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-tile__unbind {
  padding: 2px;
  border-radius: 4px;
  color: $text-muted;

  &:hover {
    color: $color-danger;
    background: $color-danger-soft;
  }
}

.kb-tile__sliders {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mini-slider {
  display: flex;
  flex-direction: column;
  gap: 2px;

  > span {
    font-size: 10px;
    color: $text-muted;
  }
}

.add-knowledge {
  position: relative;
}

.add-kb-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: $accent-emphasis;
  background: $accent-light;
  border: 1px dashed color-mix(in srgb, $accent 35%, transparent);
}

.unbound-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid $border-light;
  background: var(--bg-card);
}

.unbound-item {
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.chip {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 40%, transparent);
    color: $accent-emphasis;
  }

  &--removable {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: color-mix(in srgb, $accent 10%, transparent);
    border-color: color-mix(in srgb, $accent 25%, transparent);
    color: $accent-emphasis;
  }
}

.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.custom-chip-row {
  display: flex;
  gap: 8px;

  .input {
    flex: 1;
    min-width: 0;
  }
}

.add-chip-btn {
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12px;
  color: $accent-emphasis;
  background: $accent-light;
  border: 1px solid color-mix(in srgb, $accent 25%, transparent);
}

.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  cursor: pointer;

  input {
    accent-color: $accent;
  }
}

.advanced-block {
  padding: 16px;
  border-radius: 12px;
  border: 1px dashed $border-light;
}

.advanced-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }
}

.advanced-block[open] .advanced-chevron {
  transform: rotate(180deg);
}

.advanced-chevron {
  transition: transform 0.2s;
}

.advanced-block--files {
  margin-top: 12px;
}

.prompt-preview-wrap {
  margin-top: 10px;
}

.prompt-preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.prompt-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.legend-chip {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--seg-color) 12%, transparent);
  color: var(--seg-color);
}

.copy-prompt-btn {
  padding: 6px 12px;
  font-size: 11px;
  color: $accent-emphasis;
  background: $accent-light;
  border-radius: 8px;
}

.prompt-segments {
  border-radius: 10px;
  border: 1px solid $border-light;
  background: $bg-input;
  overflow: hidden;
}

.prompt-segment {
  border-left: 3px solid var(--seg-color);
}

.prompt-segment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 0;
}

.prompt-segment-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--seg-color);
}

.prompt-segment-file {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: $text-muted;
}

.prompt-segment-body {
  margin: 0;
  padding: 8px 12px 12px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: $text-secondary;
}

.prompt-segment-divider {
  border: none;
  border-top: 1px dashed $border-light;
  margin: 0 12px;
}

@media (max-width: 720px) {
  .basic-grid {
    grid-template-columns: 1fr;
  }

  .tone-grid {
    grid-template-columns: 1fr;
  }

  .field-row {
    flex-direction: column;
  }
}

.local-skills-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.local-skill-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 60%, transparent);
  border: 1px solid $border-light;
}

.local-skill-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.local-skill-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  flex-shrink: 0;

  &--blue {
    background: color-mix(in srgb, #3b82f6 14%, transparent);
    color: #3b82f6;
  }
  &--green {
    background: color-mix(in srgb, #22c55e 14%, transparent);
    color: #22c55e;
  }
  &--purple {
    background: color-mix(in srgb, $accent 14%, transparent);
    color: $accent;
  }
  &--pink {
    background: color-mix(in srgb, #ec4899 14%, transparent);
    color: #ec4899;
  }
}

.local-skill-details {
  min-width: 0;
}

.local-skill-name {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.local-skill-desc {
  font-size: 11px;
  color: $text-muted;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.local-skill-toggle {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  flex-shrink: 0;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .switch {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: color-mix(in srgb, $border-light 80%, transparent);
    transition: 0.2s;
    border-radius: 18px;

    &:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 2px;
      bottom: 2px;
      background-color: var(--bg-card);
      transition: 0.2s;
      border-radius: 50%;
    }
  }

  input:checked + .switch {
    background-color: $accent-emphasis;
  }

  input:checked + .switch:before {
    transform: translateX(14px);
  }
}

.local-skills-empty {
  font-size: 12px;
  color: $text-muted;
  text-align: center;
  padding: 16px;
}
</style>
