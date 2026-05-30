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
.app-toast {
  position: absolute;
  top: 20px;
  left: 50%;
  z-index: 3000;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: min(520px, calc(100% - 48px));
  max-width: 800px;
  padding: 12px 14px;
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
  transform: translateX(-50%);
  backdrop-filter: blur(8px);
  pointer-events: auto;

  &--error {
    background: rgba(58, 22, 30, 0.96);
    border: 1px solid rgba(224, 49, 81, 0.45);
    color: rgba(255, 255, 255, 0.96);

    .app-toast-icon {
      color: #ff8fa3;
    }
  }

  &--success {
    background: rgba(22, 58, 40, 0.96);
    border: 1px solid rgba(76, 175, 80, 0.45);
    color: rgba(255, 255, 255, 0.95);

    .app-toast-icon {
      color: #6ee7a0;
    }
  }

  &--info {
    background: rgba(24, 32, 48, 0.96);
    border: 1px solid rgba(120, 150, 220, 0.4);
    color: rgba(255, 255, 255, 0.95);

    .app-toast-icon {
      color: #9ec5ff;
    }
  }
}

.app-toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.app-toast-text {
  flex: 1;
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
  color: rgba(255, 255, 255, 0.72);

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
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
