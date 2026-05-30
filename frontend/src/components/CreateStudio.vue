<script setup lang="ts">
import {
  ArrowUp,
  ChevronDown,
  FileText,
  Image,
  Loader2,
  Plus,
  Sparkles,
  Video,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ACCEPT_CHAT_FILES } from '../config/constants'
import BrandLogo from './BrandLogo.vue'
import CreativeSkillsMenu from './CreativeSkillsMenu.vue'
import GenPreferencesPopover from './GenPreferencesPopover.vue'
import ModelLogo from './ModelLogo.vue'
import ImageEditOverlay from './ImageEditOverlay.vue'
import WorksWaterfall from './WorksWaterfall.vue'
import { isModelReady } from '../utils/resolveModel'
import { useWorksGallery } from '../composables/useWorksGallery'
import { useAgentStore } from '../stores/agent'
import { useCreateHistoryStore } from '../stores/createHistory'
import { useSettingsStore } from '../stores/settings'
import type { CreateMode, SkillId } from '../types/agent'

const agent = useAgentStore()
const { hasItems } = useWorksGallery()
const createHistory = useCreateHistoryStore()
const settings = useSettingsStore()
const fileInput = ref<HTMLInputElement | null>(null)
const modeWrapRef = ref<HTMLElement | null>(null)
const modelPickerRef = ref<HTMLElement | null>(null)
const showModeMenu = ref(false)
const showModelMenu = ref(false)

const modes = [
  { id: 'agent' as const, label: 'Agent 模式', icon: Sparkles },
  { id: 'image' as const, label: '图片生成', icon: Image },
  { id: 'video' as const, label: '视频生成', icon: Video },
]

const currentMode = computed(() => modes.find((m) => m.id === agent.createMode))

const skillForMode = computed((): SkillId => {
  if (agent.createMode === 'video') return 'video'
  if (agent.createMode === 'image') return 'image'
  return 'chat'
})

const availableModels = computed(() => {
  let list = settings.chatModels
  if (agent.createMode === 'video') list = settings.videoModels
  else if (agent.createMode === 'image') list = settings.imageModels
  else if (agent.createMode === 'agent') list = settings.chatModels
  return list.filter(isModelReady)
})

const selectedModel = computed(() => {
  const models = availableModels.value
  const skill = settings.getSkill(skillForMode.value)
  const id = skill?.defaultModelId
  if (id) {
    const m = models.find((x) => x.id === id)
    if (m) return m
  }
  return models[0] ?? null
})

const greeting = computed(() => {
  const h = new Date().getHours()
  const period = h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好'
  return `${period}，开始你的创作`
})

async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) await agent.addAttachments(files)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    agent.generateFromStudio()
  }
}

function pickMode(id: CreateMode) {
  agent.createMode = id
  showModeMenu.value = false
  ensureDefaultModel()
}

function selectModel(id: string) {
  settings.updateSkill(skillForMode.value, { defaultModelId: id })
  showModelMenu.value = false
}

function ensureDefaultModel() {
  const models = availableModels.value
  if (!models.length) return
  const skill = settings.getSkill(skillForMode.value)
  const current = skill?.defaultModelId
  const valid = current && models.some((m) => m.id === current)
  if (!valid) {
    settings.updateSkill(skillForMode.value, { defaultModelId: models[0].id })
  }
}

function toggleModelMenu(e: MouseEvent) {
  e.stopPropagation()
  if (!availableModels.value.length) {
    agent.setCurrentView('models')
    return
  }
  showModelMenu.value = !showModelMenu.value
  showModeMenu.value = false
  agent.showSkillsMenu = false
  agent.showPrefsMenu = false
}

function closeComposerMenus() {
  showModeMenu.value = false
  showModelMenu.value = false
  agent.showSkillsMenu = false
  agent.showPrefsMenu = false
}

function toggleModeMenu(e: MouseEvent) {
  e.stopPropagation()
  agent.showSkillsMenu = false
  agent.showPrefsMenu = false
  showModelMenu.value = false
  showModeMenu.value = !showModeMenu.value
}

function onDocClick(e: MouseEvent) {
  if (showModeMenu.value && !modeWrapRef.value?.contains(e.target as Node)) {
    showModeMenu.value = false
  }
  if (showModelMenu.value && !modelPickerRef.value?.contains(e.target as Node)) {
    showModelMenu.value = false
  }
}

watch(() => agent.createMode, ensureDefaultModel)
watch(availableModels, ensureDefaultModel, { deep: true })
watch(
  () => agent.currentView,
  (view) => {
    if (view === 'create') ensureDefaultModel()
  },
)

onMounted(() => {
  document.addEventListener('click', onDocClick)
  ensureDefaultModel()
  void createHistory.hydrate(true)
})
onUnmounted(() => document.removeEventListener('click', onDocClick))

const canSend = () =>
  !agent.isProcessing &&
  (agent.inputText.trim().length > 0 || agent.pendingAttachments.length > 0)

const isCreateBusy = computed(() => agent.isCreateProcessing)

function fileBadge(name: string) {
  const ext = name.split('.').pop()?.toUpperCase()
  if (!ext || ext.length > 5) return 'FILE'
  return ext
}
</script>

<template>
  <div class="create-studio" @click="closeComposerMenus">
    <div class="create-body">
      <section class="create-top">
        <div class="greeting">
          <BrandLogo :size="52" />
          <h1>{{ greeting }}</h1>
        </div>

        <div class="composer card">
          <div v-if="agent.pendingAttachments.length" class="attachments">
            <div
              v-for="a in agent.pendingAttachments"
              :key="a.id"
              class="attach-card"
            >
              <button type="button" class="attach-remove" title="移除" @click="agent.removeAttachment(a.id)">
                <X :size="12" />
              </button>
              <div class="attach-preview">
                <img v-if="a.previewUrl" :src="a.previewUrl" :alt="a.name" class="attach-img" />
                <FileText v-else :size="28" class="attach-doc-icon" />
              </div>
              <span class="attach-badge">{{ fileBadge(a.name) }}</span>
            </div>
          </div>

          <textarea
            v-model="agent.inputText"
            class="composer-input"
            placeholder="今天想创作什么？"
            rows="3"
            @keydown="onKeydown"
          />

          <div class="composer-bar">
            <button type="button" class="icon-btn" title="上传" @click="fileInput?.click()">
              <Plus :size="18" />
            </button>

            <div class="bar-pills">
              <div ref="modeWrapRef" class="mode-wrap">
                <button type="button" class="pill" @click.stop="toggleModeMenu">
                  <component :is="currentMode?.icon ?? Sparkles" :size="14" />
                  {{ currentMode?.label ?? 'Agent 模式' }}
                  <ChevronDown :size="12" />
                </button>
                <div v-if="showModeMenu" class="mode-menu card" @click.stop>
                  <button
                    v-for="m in modes"
                    :key="m.id"
                    type="button"
                    class="mode-item"
                    :class="{ active: agent.createMode === m.id }"
                    @click="pickMode(m.id)"
                  >
                    <component :is="m.icon" :size="16" />
                    {{ m.label }}
                  </button>
                </div>
              </div>
              <GenPreferencesPopover v-if="agent.createMode !== 'agent'" />
              <CreativeSkillsMenu v-if="agent.createMode !== 'agent'" />
            </div>

            <div ref="modelPickerRef" class="model-picker-wrap">
              <button type="button" class="model-picker" @click.stop="toggleModelMenu">
                <ModelLogo v-if="selectedModel" :model="selectedModel" :size="18" />
                <span class="model-name">{{ selectedModel?.name ?? '选择模型' }}</span>
                <ChevronDown :size="12" class="chevron" :class="{ open: showModelMenu }" />
              </button>
              <div v-if="showModelMenu && availableModels.length" class="model-menu card" @click.stop>
                <button
                  v-for="m in availableModels"
                  :key="m.id"
                  type="button"
                  class="model-option"
                  :class="{ active: selectedModel?.id === m.id }"
                  @click="selectModel(m.id)"
                >
                  <ModelLogo :model="m" :size="20" />
                  <span>{{ m.name }}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              class="send-btn"
              :class="{ ready: canSend(), waiting: isCreateBusy }"
              :disabled="!canSend() && !isCreateBusy"
              title="发送"
              @click="agent.generateFromStudio()"
            >
              <Loader2 v-if="isCreateBusy" :size="18" class="om-loading-spinner" aria-hidden="true" />
              <ArrowUp v-else :size="18" stroke-width="2.5" />
            </button>
          </div>

          <input
            ref="fileInput"
            type="file"
            :accept="ACCEPT_CHAT_FILES"
            multiple
            hidden
            @change="onFiles"
          />
        </div>
      </section>

      <section class="gallery">
        <div v-if="hasItems" class="gallery-label">创作历史</div>
        <WorksWaterfall />
      </section>
    </div>

    <ImageEditOverlay />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.create-studio {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 48px 24px 32px;
}

.create-body {
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: min(6vh, 56px);
}

.create-top {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.greeting {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;

  h1 {
    font-size: 24px;
    font-weight: 500;
    color: $text-primary;
    letter-spacing: -0.02em;
    line-height: 1.3;
  }
}

.composer.card {
  width: 100%;
  padding: 18px 20px 14px;
  border-radius: 16px;
  background: var(--composer-bg);
  border: 1px solid var(--composer-border);
  box-shadow: $shadow-sm;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus-within {
    border-color: var(--composer-border-focus);
    box-shadow: $shadow-sm;
  }
}

.composer-input {
  width: 100%;
  min-height: 80px;
  resize: none;
  font-size: 15px;
  line-height: 1.6;
  color: var(--composer-text);
  background: transparent;
  border: none;

  &::placeholder {
    color: var(--composer-placeholder);
  }
}


.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.attach-card {
  position: relative;
  width: 112px;
  height: 112px;
  border-radius: 12px;
  overflow: hidden;
  background: $bg-input;
  border: 1px solid $glass-border;
  box-shadow: $shadow-sm;
}

.attach-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.attach-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.attach-doc-icon {
  color: $text-muted;
}

.attach-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}

.attach-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);

  &:hover {
    background: rgba(220, 53, 69, 0.85);
  }
}

.composer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--composer-border);
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--composer-muted);
  flex-shrink: 0;

  &:hover {
    background: var(--composer-picker-hover);
    color: var(--composer-text);
  }
}

.bar-pills {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.mode-wrap {
  position: relative;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 18px;
  border: 1px solid var(--composer-pill-border);
  background: var(--composer-pill-bg);
  font-size: 12px;
  color: var(--composer-pill-text);

  &:hover {
    border-color: $accent;
    background: var(--composer-pill-hover-bg);
    color: $accent;
  }
}

.mode-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  padding: 6px;
  z-index: 40;
  background: var(--composer-menu-bg);
  border: 1px solid var(--composer-border);
}

.mode-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
  color: var(--composer-menu-text);

  &:hover {
    background: var(--composer-option-hover);
  }

  &.active {
    color: $accent;
    font-weight: 600;
    background: var(--composer-option-hover);
  }
}

.model-picker-wrap {
  position: relative;
  flex-shrink: 0;
}

.model-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 160px;
  padding: 6px 10px;
  border-radius: 18px;
  border: 1px solid var(--composer-pill-border);
  background: var(--composer-pill-bg);
  font-size: 12px;
  color: var(--composer-pill-text);

  &:hover {
    border-color: $accent;
    background: var(--composer-pill-hover-bg);
  }
}

.model-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex-shrink: 0;
  transition: transform 0.15s;

  &.open {
    transform: rotate(180deg);
  }
}

.model-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
  z-index: 40;
  background: var(--composer-menu-bg);
  border: 1px solid var(--composer-border);
}

.model-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
  color: var(--composer-menu-text);

  &:hover {
    background: var(--composer-option-hover);
  }

  &.active {
    color: $accent;
    font-weight: 600;
    background: var(--composer-option-hover);
  }
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $accent-light;
  color: $text-muted;
  transition: background 0.15s, color 0.15s;

  &.ready {
    background: var(--btn-primary-gradient, $accent);
    color: $btn-primary-text;

    &:hover {
      filter: brightness(1.08);
    }
  }

  &.waiting {
    background: var(--btn-primary-gradient, $accent);
    color: $btn-primary-text;
    cursor: wait;
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.gallery {
  flex-shrink: 0;
  width: 100%;
}

.gallery-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 12px;
}
</style>
