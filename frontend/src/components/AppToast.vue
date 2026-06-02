<script setup lang="ts">
import { AlertCircle, AlertTriangle, Check, Info, X } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useAgentStore } from '../stores/agent'
import { useToastStore } from '../stores/toast'

const agent = useAgentStore()
const toast = useToastStore()
const { message, kind, visible, action } = storeToRefs(toast)

function onToastAction() {
  const fn = action.value?.onClick
  toast.dismiss()
  fn?.()
}

const Icon = computed(() => {
  if (kind.value === 'success') return Check
  if (kind.value === 'error') return AlertCircle
  if (kind.value === 'warning') return AlertTriangle
  return Info
})
</script>

<template>
  <Transition name="app-toast">
    <div
      v-if="visible"
      class="app-toast"
      :class="[
        `app-toast--${kind}`,
        {
          'app-toast--in-edit': agent.imageEditOpen,
          'app-toast--in-edit-rail': agent.imageEditOpen && agent.imageEditVersions.length > 0,
        },
      ]"
      role="alert"
      aria-live="assertive"
    >
      <component :is="Icon" :size="16" class="app-toast-icon" />
      <span class="app-toast-text">{{ message }}</span>
      <button
        v-if="action"
        type="button"
        class="app-toast-action"
        @click="onToastAction"
      >
        {{ action.label }}
      </button>
      <button type="button" class="app-toast-close" title="关闭" @click="toast.dismiss()">
        <X :size="14" />
      </button>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as *;

// 与 ImageEditOverlay 侧栏/版本轨宽度保持一致，使 Toast 对齐主图区域中心
$edit-rail-w: 108px;
$edit-side-w: 400px;
$edit-stage-shift: 32px;

.app-toast {
  @include cosmic-top-toast;

  &--in-edit-rail {
    left: calc(#{$edit-rail-w} + (100vw - #{$edit-rail-w} - #{$edit-side-w}) / 2 + #{$edit-stage-shift});
  }

  &--in-edit:not(.app-toast--in-edit-rail) {
    left: calc((100vw - #{$edit-side-w}) / 2 + #{$edit-stage-shift});
  }

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

  &--warning {
    border-color: color-mix(in srgb, #e6a817 45%, $glass-border);

    .app-toast-icon {
      color: #e6a817;
    }
  }
}

.app-toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.app-toast-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-line;
}

.app-toast-action {
  flex-shrink: 0;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: $accent;
  white-space: nowrap;
  transition: color 0.15s;

  &:hover {
    color: $accent-emphasis;
  }
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

@media (max-width: 900px) {
  .app-toast--in-edit-rail {
    left: calc(#{$edit-rail-w} + (100vw - #{$edit-rail-w}) / 2 + #{$edit-stage-shift});
  }

  .app-toast--in-edit:not(.app-toast--in-edit-rail) {
    left: 50%;
  }
}

@media (max-width: 720px) {
  .app-toast--in-edit-rail {
    left: calc(88px + (100vw - 88px) / 2 + #{$edit-stage-shift});
  }
}
</style>
