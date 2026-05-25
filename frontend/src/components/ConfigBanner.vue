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
  background: rgba(255, 248, 220, 0.92);
  border: 1px solid rgba(184, 134, 11, 0.28);
  border-radius: $radius-sm;
  font-size: 12px;
  color: #92600a;
}
</style>
