<script setup lang="ts">
import { ref } from 'vue'
import { useAgentConfigStore } from '../stores/agentConfig'
import { LAYER_LABELS, type AgentLayerKey } from '../types/agentConfig'

const agentConfig = useAgentConfigStore()
const activeTab = ref<AgentLayerKey>('agents')

const tabs = (Object.keys(LAYER_LABELS) as AgentLayerKey[]).map((key) => ({
  key,
  ...LAYER_LABELS[key],
}))
</script>

<template>
  <div class="layers-panel">
    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ active: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        {{ t.title.replace('.md', '') }}
      </button>
    </div>

    <div v-for="t in tabs" :key="t.key" v-show="activeTab === t.key" class="editor-wrap">
      <p class="hint">{{ t.subtitle }}</p>
      <textarea
        class="layer-editor"
        :value="agentConfig.layers[t.key]"
        rows="14"
        @input="agentConfig.updateLayer(t.key, ($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <button class="reset-btn" @click="agentConfig.resetLayers()">恢复四层默认文案</button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.layers-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tab {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: $radius-sm;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;

  &.active {
    color: $accent;
    border-color: $accent;
    background: $accent-light;
    font-weight: 600;
  }
}

.hint {
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.layer-editor {
  width: 100%;
  padding: 12px;
  font-size: 13px;
  line-height: 1.55;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  color: $text-primary;
  resize: vertical;

  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px $accent-light;
  }
}

.reset-btn {
  align-self: flex-start;
  font-size: 12px;
  color: $text-muted;
  padding: 8px 0;

  &:hover {
    color: #c44;
  }
}
</style>
