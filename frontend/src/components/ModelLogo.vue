<script setup lang="ts">
import { getModelLogo } from '../utils/modelLogo'
import type { ModelConfig } from '../types/agent'

defineProps<{
  model: Pick<ModelConfig, 'id' | 'name' | 'model' | 'provider' | 'capability'>
  size?: number
}>()
</script>

<template>
  <img
    :src="getModelLogo(model)"
    :alt="model.name"
    class="model-logo"
    :style="{ width: `${size ?? 32}px`, height: `${size ?? 32}px` }"
  />
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.model-logo {
  border-radius: 8px;
  object-fit: contain;
  flex-shrink: 0;
  background: var(--logo-surface);
  border: 1px solid var(--logo-surface-border);
  padding: 3px;
  box-sizing: border-box;
}
</style>
