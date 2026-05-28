<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    /** 加载提示文案；省略则仅显示转圈 */
    label?: string
    size?: number
    /** inline：行内；block：居中块级；button：按钮内紧凑行 */
    variant?: 'inline' | 'block' | 'button'
  }>(),
  {
    label: '',
    size: 14,
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
    <span v-if="label" class="om-loading-label">{{ label }}</span>
  </span>
</template>
