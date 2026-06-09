<script setup lang="ts">
import { Check, Maximize2, Sparkles, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import LoadingIndicator from './LoadingIndicator.vue'

const props = defineProps<{
  open: boolean
  modelValue: string
  title?: string
  optimizing?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: string]
  optimize: []
}>()

const draft = ref('')

watch(
  () => props.open,
  (visible) => {
    if (visible) draft.value = props.modelValue
    document.body.style.overflow = visible ? 'hidden' : ''
  },
)

watch(
  () => props.modelValue,
  (val) => {
    if (props.open) draft.value = val
  },
)

const lineCount = computed(() => draft.value.split('\n').length)

function close() {
  emit('update:open', false)
}

function save() {
  emit('update:modelValue', draft.value)
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    save()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="prompt-modal-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="title ?? '提示词编辑器'"
      @keydown="onKeydown"
    >
      <div class="prompt-modal">
        <header class="prompt-modal__head">
          <div class="prompt-modal__title">
            <Maximize2 :size="16" />
            <span>{{ title ?? 'System Prompt 全屏编辑' }}</span>
          </div>
          <div class="prompt-modal__actions">
            <button
              type="button"
              class="prompt-modal__btn prompt-modal__btn--magic"
              :disabled="optimizing"
              @click="emit('optimize')"
            >
              <Sparkles v-if="!optimizing" :size="14" />
              <LoadingIndicator v-else :size="14" />
              AI 优化
            </button>
            <button type="button" class="prompt-modal__btn" @click="close">
              <X :size="16" />
            </button>
          </div>
        </header>

        <div class="prompt-modal__editor-wrap">
          <textarea
            v-model="draft"
            class="prompt-modal__editor"
            spellcheck="false"
            placeholder="在此编辑完整 System Prompt，支持 Markdown 与 XML 标签…"
          />
        </div>

        <footer class="prompt-modal__foot">
          <span class="prompt-modal__meta">{{ lineCount }} 行 · Cmd/Ctrl+Enter 保存</span>
          <div class="prompt-modal__foot-actions">
            <button type="button" class="prompt-modal__ghost" @click="close">取消</button>
            <button type="button" class="prompt-modal__save" @click="save">
              <Check :size="14" />
              保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.prompt-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 12, 48, 0.45);
  backdrop-filter: blur(6px);
}

.prompt-modal {
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  max-height: 100%;
  border-radius: 16px;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.92));
  border: 1px solid $border-light;
  box-shadow: 0 24px 80px rgba(74, 58, 232, 0.18);
  overflow: hidden;
}

.prompt-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
}

.prompt-modal__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.prompt-modal__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-modal__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  border: 1px solid $border-light;
  background: transparent;

  &:hover:not(:disabled) {
    color: $text-primary;
    background: $accent-light;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &--magic {
    color: $accent-emphasis;
    border-color: color-mix(in srgb, $accent 30%, $border-light);
    background: $accent-light;
  }
}

.prompt-modal__editor-wrap {
  flex: 1;
  min-height: 0;
  padding: 0;
}

.prompt-modal__editor {
  width: 100%;
  height: 100%;
  min-height: 420px;
  padding: 18px 20px;
  border: none;
  resize: none;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  color: $text-primary;
  background: color-mix(in srgb, $bg-input 90%, transparent);
  outline: none;

  &::placeholder {
    color: $text-muted;
  }
}

.prompt-modal__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid $border-light;
  flex-shrink: 0;
}

.prompt-modal__meta {
  font-size: 11px;
  color: $text-muted;
}

.prompt-modal__foot-actions {
  display: flex;
  gap: 8px;
}

.prompt-modal__ghost {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: $text-secondary;
  border: 1px solid $border-light;

  &:hover {
    background: $accent-light;
  }
}

.prompt-modal__save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--btn-primary-gradient, $accent);
  border: none;

  &:hover {
    filter: brightness(1.05);
  }
}
</style>
