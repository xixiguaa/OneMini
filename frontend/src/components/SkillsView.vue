<script setup lang="ts">
import { FileText, RotateCcw, Settings, Users, Wand2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import AgentCrewPanel from './AgentCrewPanel.vue'
import AgentRuntimePanel from './AgentRuntimePanel.vue'
import AgentSkillsPanel from './AgentSkillsPanel.vue'
import AgentWorkspacePanel from './AgentWorkspacePanel.vue'
import { useAgentConfigStore } from '../stores/agentConfig'
import { CONFIG_SECTIONS, type AgentConfigSection } from '../types/agentConfig'
import { BRAND_NAME } from '../utils/modelLogo'

const agentConfig = useAgentConfigStore()
const section = ref<AgentConfigSection>('workspace')

const sectionIcon = {
  workspace: FileText,
  runtime: Settings,
  skills: Wand2,
  crew: Users,
} as const

const activeMeta = computed(() => CONFIG_SECTIONS.find((s) => s.id === section.value))
</script>

<template>
  <div class="models-page">
    <header class="page-header">
      <h2>Agent 配置</h2>
      <p>{{ BRAND_NAME }} · 工作区 Markdown 与运行时 onemini.json（OpenClaw 式分层）</p>
    </header>

    <div class="split-layout">
      <aside class="model-list card">
        <p class="group-label">配置分区</p>
        <button
          v-for="s in CONFIG_SECTIONS"
          :key="s.id"
          type="button"
          class="model-item"
          :class="{ active: section === s.id }"
          @click="section = s.id"
        >
          <component :is="sectionIcon[s.id]" :size="20" class="section-icon" />
          <div class="item-text">
            <span class="name">
              {{ s.label }}
              <span v-if="s.id === 'crew' && agentConfig.multiAgentEnabled" class="badge-on">ON</span>
            </span>
            <span class="state">{{ s.desc }}</span>
          </div>
        </button>

        <button type="button" class="add-trigger" @click="agentConfig.resetAll()">
          <RotateCcw :size="16" />
          恢复出厂配置
        </button>
      </aside>

      <section class="right-panel card">
        <div v-if="activeMeta" class="panel-head">
          <h3>{{ activeMeta.label }}</h3>
          <p>{{ activeMeta.desc }}</p>
        </div>
        <AgentWorkspacePanel v-show="section === 'workspace'" />
        <AgentRuntimePanel v-show="section === 'runtime'" />
        <AgentSkillsPanel v-show="section === 'skills'" />
        <AgentCrewPanel v-show="section === 'crew'" />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.models-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 24px 28px;
}

.page-header {
  margin-bottom: 20px;

  h2 {
    font-size: 22px;
    font-weight: 600;
  }

  p {
    font-size: 13px;
    color: $text-secondary;
    margin-top: 4px;
  }
}

.split-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

.card {
  background: $bg-card;
  border: 1px solid $glass-border;
  border-radius: $radius-md;
  box-shadow: $shadow-sm;
  min-height: 0;
  overflow: hidden;
}

.model-list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow-y: auto;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 8px 6px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  margin-bottom: 4px;
  border: 1px solid transparent;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }

  &.active {
    background: $accent-light;
    border-color: $accent;
    box-shadow: inset 3px 0 0 $accent;

    .name {
      color: $text-primary;
      font-weight: 600;
    }
  }
}

.section-icon {
  flex-shrink: 0;
  color: $accent;
  opacity: 0.85;
}

.item-text {
  min-width: 0;

  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
  }

  .state {
    display: block;
    font-size: 11px;
    color: $text-secondary;
    margin-top: 2px;
    line-height: 1.35;
  }
}

.badge-on {
  font-size: 9px;
  padding: 1px 5px;
  background: $accent;
  color: #fff;
  border-radius: 4px;
  font-weight: 600;
}

.add-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: auto;
  padding: 12px;
  border: 1px dashed $border-light;
  border-radius: 10px;
  font-size: 13px;
  color: $text-secondary;

  &:hover {
    border-color: #c44;
    color: #c44;
    background: rgba(200, 68, 68, 0.06);
  }
}

.right-panel {
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.panel-head {
  flex-shrink: 0;
  padding: 16px 20px 0;
  border-bottom: 1px solid $border-light;
  margin-bottom: 0;

  h3 {
    font-size: 16px;
    font-weight: 600;
  }

  p {
    font-size: 12px;
    color: $text-secondary;
    margin-top: 4px;
    padding-bottom: 12px;
  }
}

@media (max-width: 768px) {
  .split-layout {
    grid-template-columns: 1fr;
  }
}
</style>
