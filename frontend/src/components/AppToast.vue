<script setup lang="ts">
import { AlertCircle, Check, Info, X } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const { message, kind, visible } = storeToRefs(toast)

const Icon = computed(() => {
  if (kind.value === 'success') return Check
  if (kind.value === 'error') return AlertCircle
  return Info
})
</script>

<template>
  <Transition name="app-toast">
    <div
      v-if="visible"
      class="app-toast"
      :class="`app-toast--${kind}`"
      role="alert"
      aria-live="assertive"
    >
      <component :is="Icon" :size="16" class="app-toast-icon" />
      <span class="app-toast-text">{{ message }}</span>
      <button type="button" class="app-toast-close" title="关闭" @click="toast.dismiss()">
        <X :size="14" />
      </button>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as *;

.app-toast {
  @include cosmic-top-toast;

  &--error {
    border-color: color-mix(in srgb, $color-danger 45%, $glass-border);

    .app-toast-icon {
      color: $color-danger;
    }
  }

  &--success {
    border-color: color-mix(in srgb, $color-success 45%, $glass-border);

    .app-toast-icon {
      color: $color-success;
    }
  }

  &--info {
    border-color: color-mix(in srgb, $accent 45%, $glass-border);

    .app-toast-icon {
      color: $accent;
    }
  }
}

.app-toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.app-toast-text {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-line;
}

.app-toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: $text-muted;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
</style>
