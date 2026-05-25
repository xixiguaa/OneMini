<script setup lang="ts">
import { ArrowUp, ChevronDown, FileText, Plus, X } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ACCEPT_CHAT_FILES } from '../config/constants'
import ModelLogo from './ModelLogo.vue'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'

defineProps<{
  centered?: boolean
}>()

const agent = useAgentStore()
const settings = useSettingsStore()
const fileInput = ref<HTMLInputElement | null>(null)
const pickerRef = ref<HTMLElement | null>(null)
const showModelMenu = ref(false)

const chatModels = computed(() => settings.chatModels)

const selectedModel = computed(() => {
  const skill = settings.getSkill('chat')
  const id = skill?.defaultModelId
  if (id) {
    const m = settings.getModel(id)
    if (m?.enabled && m.capability === 'chat') return m
  }
  return chatModels.value[0] ?? null
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    agent.sendMessage('chat')
  }
}

async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) await agent.addAttachments(files)
  if (fileInput.value) fileInput.value.value = ''
}

const canSend = () =>
  !agent.isProcessing &&
  (agent.inputText.trim().length > 0 || agent.pendingAttachments.length > 0)

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
  const skill = settings.getSkill('chat')
  if (!skill?.defaultModelId && chatModels.value[0]) {
    settings.updateSkill('chat', { defaultModelId: chatModels.value[0].id })
  }
}

watch(chatModels, ensureDefaultModel, { immediate: true })

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
      <div v-if="agent.pendingAttachments.length" class="attachments">
        <div
          v-for="a in agent.pendingAttachments"
          :key="a.id"
          class="attach-item"
        >
          <img v-if="a.previewUrl" :src="a.previewUrl" alt="" class="thumb" />
          <FileText v-else :size="18" class="doc-icon" />
          <span class="name">{{ a.name }}</span>
          <button type="button" class="remove" @click="agent.removeAttachment(a.id)">
            <X :size="12" />
          </button>
        </div>
      </div>

      <div class="composer-card">
        <textarea
          v-model="agent.inputText"
          class="composer-input"
          placeholder="输入消息…"
          rows="1"
          @keydown="onKeydown"
        />

        <div class="composer-footer">
          <button
            type="button"
            class="attach-plus"
            title="上传图片、Word、PDF、Markdown 等"
            @click="fileInput?.click()"
          >
            <Plus :size="20" stroke-width="1.75" />
          </button>

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
              :class="{ ready: canSend() }"
              :disabled="!canSend()"
              title="发送"
              @click="agent.sendMessage('chat')"
            >
              <ArrowUp :size="18" stroke-width="2.5" />
            </button>
          </div>
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
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

$column-max: 48rem;

.chat-input-area {
  flex-shrink: 0;
  padding: 12px 16px 20px;
  background: transparent;

  &.centered {
    padding: 0;
  }
}

.input-inner {
  max-width: $column-max;
  margin: 0 auto;
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.attach-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: $bg-card;
  border: 1px solid $glass-border;
  border-radius: 10px;
  max-width: 200px;

  .thumb {
    width: 36px;
    height: 36px;
    object-fit: cover;
    border-radius: 6px;
  }

  .doc-icon {
    color: $accent;
  }

  .name {
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .remove {
    color: $text-muted;
    padding: 2px;

    &:hover {
      color: #c44;
    }
  }
}

/* Claude 式：固定高度 102px；浅色输入卡，深色模式下也不反转 */
.composer-card {
  display: flex;
  flex-direction: column;
  height: 102px;
  box-sizing: border-box;
  padding: 12px 14px 8px;
  background: var(--composer-bg);
  border: 1px solid var(--composer-border);
  border-radius: 20px;
  box-shadow: $shadow-sm;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus-within {
    border-color: rgba(45, 138, 78, 0.4);
    box-shadow: 0 0 0 3px $accent-light, $shadow-sm;
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
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  height: 32px;
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
  min-width: 0;
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
  transition: background 0.15s;

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
  background: var(--composer-menu-bg);
  border: 1px solid var(--composer-border);
  border-radius: 12px;
  box-shadow: $shadow-md;

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
  background: rgba(45, 138, 78, 0.18);
  color: rgba(45, 138, 78, 0.45);
  transition: background 0.15s, color 0.15s;

  &.ready {
    background: $accent;
    color: #fff;

    &:hover {
      background: $accent-hover;
    }
  }

  &:disabled {
    cursor: not-allowed;
  }
}
</style>
