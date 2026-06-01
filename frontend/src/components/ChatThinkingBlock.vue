<script setup lang="ts">
import { Atom, ChevronDown } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { formatThinkingDuration, formatThinkingInProgress } from '../utils/deepThinking'

const props = defineProps<{
  content: string
  durationMs?: number
  streaming?: boolean
  elapsedSec?: number
}>()

const expanded = ref(true)

const headerLabel = computed(() => {
  if (props.streaming) return formatThinkingInProgress(props.elapsedSec ?? 0)
  return formatThinkingDuration(props.durationMs)
})

watch(
  () => props.streaming,
  (streaming, wasStreaming) => {
    if (wasStreaming && !streaming) {
      expanded.value = true
    }
  },
)
</script>

<template>
  <div class="thinking-block" :class="{ streaming }">
    <button
      type="button"
      class="thinking-header"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <Atom :size="16" class="thinking-icon" aria-hidden="true" />
      <span class="thinking-title">{{ headerLabel }}</span>
      <ChevronDown :size="14" class="chevron" :class="{ open: expanded }" />
    </button>

    <div v-show="expanded" class="thinking-body">
      <p v-if="content.trim()" class="thinking-text">{{ content }}</p>
      <p v-else-if="streaming" class="thinking-text thinking-text--placeholder">
        正在分析问题…
      </p>
      <span v-if="streaming && content.trim()" class="thinking-cursor" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.thinking-block {
  margin-bottom: 12px;

  &.streaming .thinking-text {
    color: $text-secondary;
  }
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 0;
  font-size: 13px;
  font-weight: 500;
  color: $accent;
  text-align: left;

  &:hover {
    opacity: 0.85;
  }
}

.thinking-icon {
  flex-shrink: 0;
  color: $accent;
}

.thinking-title {
  flex: 1;
  min-width: 0;
}

.chevron {
  flex-shrink: 0;
  opacity: 0.6;
  transition: transform 0.2s;

  &.open {
    transform: rotate(180deg);
  }
}

.thinking-body {
  margin-top: 6px;
  margin-left: 12px;
  padding-left: 14px;
  border-left: 2px solid color-mix(in srgb, $accent 25%, $border-light);
}

.thinking-text {
  font-size: 14px;
  line-height: 1.65;
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;

  &--placeholder {
    color: $text-muted;
    font-style: italic;
  }
}

.thinking-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: $accent;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
