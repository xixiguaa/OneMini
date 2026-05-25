<script setup lang="ts">
import { getProviderDefinition, getProviderLogo, getProviderLabel } from '../config/providers'
import type { ModelProvider } from '../config/providers'

const props = defineProps<{
  modelValue: ModelProvider
  providers: ModelProvider[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ModelProvider]
}>()

function select(id: ModelProvider) {
  emit('update:modelValue', id)
}
</script>

<template>
  <div class="provider-select" role="listbox" :aria-label="'选择服务商'">
    <button
      v-for="id in providers"
      :key="id"
      type="button"
      class="provider-card"
      :class="{ active: modelValue === id }"
      role="option"
      :aria-selected="modelValue === id"
      :title="getProviderLabel(id)"
      @click="select(id)"
    >
      <img
        :src="getProviderLogo(id)"
        :alt="getProviderLabel(id)"
        class="provider-logo"
        width="28"
        height="28"
      />
      <span class="provider-name">{{ getProviderLabel(id) }}</span>
    </button>
  </div>
  <p v-if="modelValue" class="selected-hint">
    <img :src="getProviderLogo(modelValue)" alt="" class="hint-logo" width="16" height="16" />
    已选：{{ getProviderLabel(modelValue) }}
    <span v-if="getProviderDefinition(modelValue).defaultBaseUrl" class="hint-url">
      · 默认 {{ getProviderDefinition(modelValue).defaultBaseUrl }}
    </span>
  </p>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.provider-select {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.provider-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  border-radius: 8px;
  border: 1px solid $glass-border;
  background: $bg-input;
  text-align: center;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: $accent;
    background: $accent-light;
  }

  &.active {
    border-color: $accent;
    background: $accent-light;
  }
}

.provider-logo {
  border-radius: 6px;
  object-fit: contain;
  background: var(--logo-surface);
  border: 1px solid var(--logo-surface-border);
  padding: 3px;
  box-sizing: border-box;
}

.provider-name {
  font-size: 11px;
  line-height: 1.25;
  color: $text-secondary;
  word-break: break-word;
}

.provider-card.active .provider-name {
  color: $accent;
  font-weight: 600;
}

.selected-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  font-size: 11px;
  color: $text-muted;
}

.hint-logo {
  border-radius: 4px;
  object-fit: contain;
  background: var(--logo-surface);
  border: 1px solid var(--logo-surface-border);
}

.hint-url {
  color: $text-muted;
  word-break: break-all;
}

@media (max-width: 420px) {
  .provider-select {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
