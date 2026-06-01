<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    /** 加载提示文案；省略则仅显示转圈 */
    label?: string
    size?: number
    /** 思考中已用秒数；传入时在 label 后显示计时 */
    elapsedSec?: number
    /** inline：行内；block：居中块级；button：按钮内紧凑行；thinking：对话思考态 */
    variant?: 'inline' | 'block' | 'button' | 'thinking'
  }>(),
  {
    label: '',
    size: 14,
    elapsedSec: undefined,
    variant: 'inline',
  },
)
</script>

<template>
  <span
    class="om-loading"
    :class="`om-loading--${variant}`"
    role="status"
    :aria-label="label || '加载中'"
  >
    <Loader2 :size="size" class="om-loading-spinner" aria-hidden="true" />
    <span v-if="label" class="om-loading-label">
      <template v-if="elapsedSec != null && elapsedSec > 0">{{ label }} ({{ elapsedSec }} 秒)</template>
      <template v-else>{{ label }}…</template>
    </span>
  </span>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.om-loading--thinking {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 28px;
  color: $accent-emphasis;

  .om-loading-spinner {
    color: $accent;
  }

  .om-loading-label {
    color: $text-secondary;
    font-size: 14px;
    font-weight: 500;
    animation: thinking-pulse 1.6s ease-in-out infinite;
  }
}

@keyframes thinking-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
</style>
