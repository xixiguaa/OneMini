<script setup lang="ts">
import { Leaf } from 'lucide-vue-next'
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const hasChatModel = computed(() => settings.chatModels.length > 0)
</script>

<template>
  <div v-if="!hasChatModel" class="config-banner">
    <Leaf :size="16" />
    <span>
      请先在「模型配置」为 DeepSeek、GPT、Claude、GLM 等填写 API Key；图片/视频模型请自行添加。
    </span>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.config-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 10px 14px;
  background: color-mix(in srgb, $color-warning 10%, $glass-bg);
  backdrop-filter: blur(var(--glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px));
  border: var(--glass-border-width, 0.5px) solid color-mix(in srgb, $color-warning 30%, $glass-border);
  border-radius: $radius-sm;
  font-size: 12px;
  color: color-mix(in srgb, $color-warning 75%, $text-primary);
  box-shadow: var(--glass-float-shadow, $shadow-md);
}
</style>
