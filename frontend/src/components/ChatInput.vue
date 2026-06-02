<script setup lang="ts">
import { ArrowUp, ChevronDown, Loader2, Plus } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ACCEPT_CREATE_AGENT } from '../config/constants'
import ChatAttachmentCard from './ChatAttachmentCard.vue'
import ChatKnowledgeModeToggle from './ChatKnowledgeModeToggle.vue'
import ModelLogo from './ModelLogo.vue'
import { isModelReady, resolveChatModel } from '../utils/resolveModel'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'

defineProps<{
  centered?: boolean
}>()

const agent = useAgentStore()
const agentConfig = useAgentConfigStore()
const settings = useSettingsStore()
const fileInput = ref<HTMLInputElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)
const showModelMenu = ref(false)

/** 仅展示已启用且已配置密钥的模型，与后端实际调用一致 */
const chatModels = computed(() => settings.chatModels.filter(isModelReady))

/** 与 handleChat 共用 resolveChatModel，保证展示与 API 调用一致 */
const selectedModel = computed(() => {
  const resolved = resolveChatModel(agentConfig.skeleton, settings)
  if (resolved.ok) return resolved.model

  const id = settings.getSkill('chat')?.defaultModelId
  if (id) {
    const m = settings.getModel(id)
    if (m?.enabled) return m
  }
  return chatModels.value[0] ?? null
})

const isChatBusy = computed(() => agent.isChatProcessing)

const attachmentsLoading = computed(() =>
  agent.pendingAttachments.some((a) => a.loading),
)

const canSend = () =>
  !agent.isProcessing &&
  !attachmentsLoading.value &&
  (agent.inputText.trim().length > 0 || agent.pendingAttachments.length > 0)

const hasInput = () =>
  agent.inputText.trim().length > 0 || agent.pendingAttachments.length > 0

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (agent.isProcessing || attachmentsLoading.value || !hasInput()) return
    agent.sendMessage('chat')
  }
}

async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) await agent.addAttachments(files)
  if (fileInput.value) fileInput.value.value = ''
}

function selectModel(id: string) {
  settings.updateSkill('chat', { defaultModelId: id })
  showModelMenu.value = false
}

function toggleModelMenu(e: MouseEvent) {
  e.stopPropagation()
  if (!chatModels.value.length) {
    agent.setCurrentView('models')
    return
  }
  showModelMenu.value = !showModelMenu.value
}

function onDocClick(e: MouseEvent) {
  if (!pickerRef.value?.contains(e.target as Node)) {
    showModelMenu.value = false
  }
}

function ensureDefaultModel() {
  const models = chatModels.value
  if (!models.length) return
  const skill = settings.getSkill('chat')
  const current = skill?.defaultModelId
  if (!current) {
    settings.updateSkill('chat', { defaultModelId: models[0].id })
    return
  }
  if (!settings.getModel(current)) {
    settings.updateSkill('chat', { defaultModelId: models[0].id })
  }
}

watch(chatModels, ensureDefaultModel, { immediate: true, deep: true })

onMounted(() => {
  document.addEventListener('click', onDocClick)
  ensureDefaultModel()
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div class="chat-input-area" :class="{ centered }">
    <div class="input-inner">
      <div class="composer-card">
        <div v-if="agent.pendingAttachments.length" class="attachments">
          <ChatAttachmentCard
            v-for="a in agent.pendingAttachments"
            :key="a.id"
            :attachment="a"
            @remove="agent.removeAttachment(a.id)"
          />
        </div>

        <textarea
          v-model="agent.inputText"
          class="composer-input"
          placeholder="输入消息…"
          rows="1"
          :disabled="agent.isProcessing"
          @keydown="onKeydown"
        />

        <div class="composer-footer">
          <div class="footer-left">
            <button
              type="button"
              class="attach-plus"
              title="上传图片、Word、PDF、Excel、Markdown 等"
              @click="fileInput?.click()"
            >
              <Plus :size="20" stroke-width="1.75" />
            </button>
            <ChatKnowledgeModeToggle v-if="!agent.isIncognito" />
          </div>

          <div class="footer-right">
            <div ref="pickerRef" class="model-picker-wrap">
              <button type="button" class="model-picker" @click="toggleModelMenu">
                <ModelLogo v-if="selectedModel" :model="selectedModel" :size="18" />
                <span class="model-name">{{ selectedModel?.name ?? '选择模型' }}</span>
                <ChevronDown :size="14" class="chevron" :class="{ open: showModelMenu }" />
              </button>

              <div v-if="showModelMenu && chatModels.length" class="model-menu">
                <button
                  v-for="m in chatModels"
                  :key="m.id"
                  type="button"
                  class="model-option"
                  :class="{ active: selectedModel?.id === m.id }"
                  @click="selectModel(m.id)"
                >
                  <ModelLogo :model="m" :size="22" />
                  <span class="option-name">{{ m.name }}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              class="send-btn"
              :class="{ ready: canSend(), waiting: isChatBusy }"
              :disabled="!canSend()"
              title="发送"
              @click="agent.sendMessage('chat')"
            >
              <Loader2 v-if="isChatBusy" :size="18" class="om-loading-spinner" aria-hidden="true" />
              <ArrowUp v-else :size="18" stroke-width="2.5" />
            </button>
          </div>
        </div>

        <input
          ref="fileInput"
          type="file"
          :accept="ACCEPT_CREATE_AGENT"
          multiple
          hidden
          @change="onFiles"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.chat-input-area {
  flex-shrink: 0;
  padding: 12px 16px 20px;
  background: transparent;

  &.centered {
    padding: 0;
  }
}

.input-inner {
  max-width: $chat-column-max;
  margin: 0 auto;
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

/* 统一玻璃输入卡：textarea 透明，无内层黑框 */
.composer-card {
  @include cosmic.cosmic-glass-frost(22px);
  display: flex;
  flex-direction: column;
  min-height: 102px;
  height: auto;
  box-sizing: border-box;
  padding: 12px 14px 10px;
  background: var(--composer-bg, var(--glass-fill-gradient));
  transition: box-shadow 0.2s;
  overflow: visible;

  &:focus-within {
    box-shadow:
      var(--glass-inset-highlight),
      var(--glass-float-shadow-hover, var(--glass-float-shadow, $shadow-md)),
      0 0 0 1px color-mix(in srgb, var(--composer-border-focus) 35%, transparent);
  }

  :deep(.model-logo) {
    background: var(--composer-logo-bg);
  }
}

.composer-input {
  flex: 1;
  width: 100%;
  min-height: 0;
  resize: none;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 4px 6px 0;
  font-size: 15px;
  line-height: 1.55;
  background: transparent;
  border: none;
  color: var(--composer-text);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  &::placeholder {
    color: var(--composer-placeholder);
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  min-height: 32px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: visible;
}

.attach-plus {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--composer-muted);
  flex-shrink: 0;

  &:hover {
    color: var(--composer-text);
    background: var(--composer-picker-hover);
  }
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.model-picker-wrap {
  position: relative;
}

.model-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--composer-muted);
  background: var(--composer-pill-bg);
  border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border);
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: var(--composer-picker-hover);
    color: var(--composer-text);
  }

  .model-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    flex-shrink: 0;
    opacity: 0.55;
    transition: transform 0.2s;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.model-menu {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
  max-height: 240px;
  overflow-y: auto;
  padding: 6px;
  background: var(--composer-menu-bg, var(--glass-fill-gradient));

  :deep(.model-logo) {
    background: var(--composer-logo-bg);
  }
}

.model-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  font-size: 13px;
  color: var(--composer-menu-text);

  &:hover {
    background: var(--composer-option-hover);
  }

  &.active {
    background: var(--composer-option-hover);
    font-weight: 600;
    color: var(--composer-menu-text);
  }

  .option-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>
