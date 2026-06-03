<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import LoadingIndicator from './LoadingIndicator.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    /** 危险操作样式（如删除） */
    danger?: boolean
    loading?: boolean
    /** 主按钮为外链（新标签页打开），仍触发 confirm */
    confirmHref?: string
    showConfirm?: boolean
    showCancel?: boolean
    maxWidth?: string
  }>(),
  {
    title: '请确认',
    message: '',
    confirmLabel: '确定',
    cancelLabel: '取消',
    danger: false,
    loading: false,
    confirmHref: '',
    showConfirm: true,
    showCancel: true,
    maxWidth: '400px',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

function close() {
  if (props.loading) return
  emit('update:open', false)
  emit('cancel')
}

function onConfirm() {
  if (props.loading) return
  emit('confirm')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
}

watch(
  () => props.open,
  (visible) => {
    document.body.style.overflow = visible ? 'hidden' : ''
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="open"
        class="confirm-overlay"
        role="presentation"
        @click.self="close"
      >
        <div
          class="confirm-dialog"
          role="alertdialog"
          :style="{ maxWidth }"
          :aria-labelledby="title ? 'confirm-title' : undefined"
          :aria-describedby="message ? 'confirm-message' : undefined"
          aria-modal="true"
        >
          <h3 v-if="title" id="confirm-title" class="confirm-title" :class="{ 'is-danger': danger }">
            {{ title }}
          </h3>
          <p v-if="message" id="confirm-message" class="confirm-message">{{ message }}</p>
          <div v-if="$slots.default" class="confirm-body">
            <slot />
          </div>

          <div v-if="showCancel || showConfirm" class="confirm-actions">
            <button
              v-if="showCancel"
              type="button"
              class="btn-cancel"
              :disabled="loading"
              @click="close"
            >
              {{ cancelLabel }}
            </button>
            <a
              v-if="showConfirm && confirmHref"
              class="btn-confirm"
              :class="{ 'btn-confirm--danger': danger }"
              :href="confirmHref"
              target="_blank"
              rel="noopener noreferrer"
              @click="onConfirm"
            >
              {{ confirmLabel }}
            </a>
            <button
              v-else-if="showConfirm"
              type="button"
              class="btn-confirm"
              :class="{ 'btn-confirm--danger': danger }"
              :disabled="loading"
              @click="onConfirm"
            >
              <LoadingIndicator v-if="loading" label="处理中" variant="button" :size="13" />
              <template v-else>{{ confirmLabel }}</template>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as *;

.confirm-overlay {
  @include cosmic-modal-overlay;
}

.confirm-dialog {
  @include cosmic-modal-panel(420px);
  padding: 22px 22px 18px;
}

.confirm-title {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
  color: $text-primary;
  line-height: 1.35;

  &.is-danger {
    color: $color-danger;
  }
}

.confirm-message {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.55;
  color: $text-secondary;
  white-space: pre-line;
}

.confirm-body {
  margin: -8px 0 20px;
  font-size: 14px;
  line-height: 1.55;
  color: $text-secondary;

  :deep(.dialog-path) {
    margin: 0 0 10px;
    padding: 10px 12px;
    border-radius: 8px;
    background: $bg-input;
    border: 1px solid $border-light;

    code {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      line-height: 1.45;
      word-break: break-all;
      color: $text-primary;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  }

  :deep(.dialog-path-label) {
    font-size: 11px;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  :deep(.dialog-hint) {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: $text-muted;
  }
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel,
.btn-confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  padding: 9px 16px;
  font-size: 14px;
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.15s, opacity 0.15s;

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
}

.btn-cancel {
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;

  &:hover:not(:disabled) {
    background: $accent-light;
    color: $text-primary;
  }
}

.btn-confirm {
  color: $btn-primary-text;
  background: var(--btn-primary-gradient, $accent);
  border: var(--glass-border-width, 0.5px) solid rgba(255, 255, 255, 0.12);
  box-shadow: var(--btn-primary-shadow, $shadow-glow);

  :deep(.om-loading),
  :deep(.om-loading-label),
  :deep(.om-loading-spinner) {
    color: inherit;
  }

  &:hover:not(:disabled) {
    filter: brightness(1.08);
    box-shadow: var(--btn-primary-shadow, $shadow-glow), $shadow-glow;
  }

  &:disabled {
    opacity: 0.92;
    cursor: wait;
    filter: none;
  }

  &:focus-visible {
    outline: none;
    box-shadow: $shadow-focus;
  }

  &.btn-confirm--danger {
    color: #fff;
    background: $color-danger;
    border-color: $color-danger;
    box-shadow: none;

    :deep(.om-loading),
    :deep(.om-loading-label),
    :deep(.om-loading-spinner) {
      color: inherit;
    }

    &:hover:not(:disabled) {
      filter: brightness(1.06);
      box-shadow: none;
    }

    &:disabled {
      opacity: 0.92;
      cursor: wait;
    }

    &:focus-visible {
      box-shadow: $shadow-focus-danger;
    }
  }
}

@include cosmic-modal-fade-transition('confirm-fade', '.confirm-dialog');
</style>
