<script setup lang="ts">
import { ref } from 'vue'
import AgentLayersPanel from './AgentLayersPanel.vue'
import MultiAgentPanel from './MultiAgentPanel.vue'
import SkeletonConfigPanel from './SkeletonConfigPanel.vue'
import SkillConfigPanel from './SkillConfigPanel.vue'
import SkillPluginsPanel from './SkillPluginsPanel.vue'
import { useAgentConfigStore } from '../stores/agentConfig'

const agentConfig = useAgentConfigStore()

type ConfigTab = 'layers' | 'skeleton' | 'skills' | 'plugins' | 'multi'
const tab = ref<ConfigTab>('layers')

const tabs: { id: ConfigTab; label: string }[] = [
  { id: 'layers', label: '四层配置' },
  { id: 'skeleton', label: '骨架' },
  { id: 'skills', label: '核心技能' },
  { id: 'plugins', label: '技能插件' },
  { id: 'multi', label: '多智能体' },
]
</script>

<template>
  <div class="page-view">
    <header class="page-header">
      <h2>Agent 配置中心</h2>
      <p>
        声明式工程化：宪法 → 灵魂/身份 → 人设 → 骨架（onemini.json）+ 可插拔 Skills + 多智能体协作
      </p>
    </header>

    <nav class="page-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="page-tab"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'multi' && agentConfig.multiAgentEnabled" class="badge">ON</span>
      </button>
    </nav>

    <AgentLayersPanel v-show="tab === 'layers'" />
    <SkeletonConfigPanel v-show="tab === 'skeleton'" />
    <SkillConfigPanel v-show="tab === 'skills'" />
    <SkillPluginsPanel v-show="tab === 'plugins'" />
    <MultiAgentPanel v-show="tab === 'multi'" />

    <footer class="page-footer">
      <button class="link-btn" @click="agentConfig.resetAll()">全部恢复出厂配置</button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.page-view {
  flex: 1;
  overflow-y: auto;
  padding: 28px 36px 48px;
  max-width: 800px;
}

.page-header {
  margin-bottom: 20px;

  h2 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  p {
    font-size: 13px;
    color: $text-secondary;
    line-height: 1.5;
  }
}

.page-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid $glass-border;
}

.page-tab {
  padding: 8px 14px;
  font-size: 13px;
  border-radius: $radius-sm;
  color: $text-secondary;
  background: transparent;
  border: 1px solid transparent;

  &.active {
    color: $accent;
    background: $accent-light;
    border-color: rgba(45, 138, 78, 0.25);
    font-weight: 600;
  }

  .badge {
    margin-left: 6px;
    font-size: 9px;
    padding: 2px 5px;
    background: $accent;
    color: #fff;
    border-radius: 4px;
    vertical-align: middle;
  }
}

.page-footer {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid $glass-border;
}

.link-btn {
  font-size: 12px;
  color: $text-muted;

  &:hover {
    color: #c44;
  }
}
</style>
