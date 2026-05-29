<script setup lang="ts">
import {
  ArrowUp,
  ChevronDown,
  Image,
  Loader2,
  Plus,
  Sparkles,
  Video,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ACCEPT_CHAT_FILES } from '../config/constants'
import BrandLogo from './BrandLogo.vue'
import CreativeSkillsMenu from './CreativeSkillsMenu.vue'
import GenPreferencesPopover from './GenPreferencesPopover.vue'
import WorksWaterfall from './WorksWaterfall.vue'
import { useAgentStore } from '../stores/agent'

const agent = useAgentStore()
const fileInput = ref<HTMLInputElement | null>(null)
const modeWrapRef = ref<HTMLElement | null>(null)
const showModeMenu = ref(false)

const modes = [
  { id: 'agent' as const, label: 'Agent 模式', icon: Sparkles },
  { id: 'image' as const, label: '图片生成', icon: Image },
  { id: 'video' as const, label: '视频生成', icon: Video },
]

const currentMode = computed(() => modes.find((m) => m.id === agent.createMode))

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

function pickMode(id: typeof agent.createMode) {
  agent.createMode = id
  showModeMenu.value = false
}

function closeComposerMenus() {
  showModeMenu.value = false
  agent.showSkillsMenu = false
  agent.showPrefsMenu = false
}

function toggleModeMenu(e: MouseEvent) {
  e.stopPropagation()
  agent.showSkillsMenu = false
  agent.showPrefsMenu = false
  showModeMenu.value = !showModeMenu.value
}

function onDocClick(e: MouseEvent) {
  if (showModeMenu.value && !modeWrapRef.value?.contains(e.target as Node)) {
    showModeMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

const canSend = () =>
  !agent.isProcessing &&
  (agent.inputText.trim().length > 0 || agent.pendingAttachments.length > 0)
</script>

<template>
  <div class="create-studio" @click="closeComposerMenus">
    <section class="hero">
      <div class="hero-center">
        <div class="greeting">
          <BrandLogo :size="64" />
          <h1>{{ greeting }}</h1>
        </div>

        <div class="composer card">
        <textarea
          v-model="agent.inputText"
          class="composer-input"
          placeholder="今天想创作什么？"
          rows="3"
          @keydown="onKeydown"
        />

        <div v-if="agent.pendingAttachments.length" class="attach-chips">
          <span v-for="a in agent.pendingAttachments" :key="a.id" class="chip">
            {{ a.name }}
            <button type="button" @click="agent.removeAttachment(a.id)">×</button>
          </span>
        </div>

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
            <GenPreferencesPopover />
            <CreativeSkillsMenu />
          </div>

          <button
            type="button"
            class="send-btn"
            :class="{ ready: canSend(), waiting: agent.isProcessing }"
            :disabled="!canSend() && !agent.isProcessing"
            title="发送"
            @click="agent.generateFromStudio()"
          >
            <Loader2 v-if="agent.isProcessing" :size="18" class="om-loading-spinner" aria-hidden="true" />
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
      </div>
    </section>

    <section class="gallery">
      <WorksWaterfall />
    </section>
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
  flex-direction: column;
}

.hero {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(72vh, 640px);
  padding: 32px 24px;
}

.hero-center {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.greeting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 16px;

  h1 {
    font-size: 26px;
    font-weight: 500;
    color: $text-primary;
    letter-spacing: -0.02em;
    line-height: 1.3;
  }
}

.composer.card {
  width: 100%;
  padding: 16px 18px 14px;
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
  min-height: 72px;
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

.attach-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 4px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: $accent-light;
  border-radius: 12px;
  font-size: 11px;
  color: $accent;

  button {
    font-size: 14px;
    line-height: 1;
    opacity: 0.7;
    &:hover { opacity: 1; }
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
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  padding: 8px 28px 32px;
}

.gallery-label {
  font-size: 12px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 12px;
}
</style>
