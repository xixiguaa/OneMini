<script setup lang="ts">
import { FileText, Settings, Users, Wand2 } from 'lucide-vue-next'
import { ref } from 'vue'
import AgentPersonaPanel from './AgentPersonaPanel.vue'
import AgentRuntimePanel from './AgentRuntimePanel.vue'
import AgentSkillsPanel from './AgentSkillsPanel.vue'
import AgentCrewPanel from './AgentCrewPanel.vue'
import { useAgentConfigStore } from '../stores/agentConfig'
import { CONFIG_SECTIONS, type AgentConfigSection } from '../types/agentConfig'

const agentConfig = useAgentConfigStore()
const section = ref<AgentConfigSection>('workspace')

const sectionIcon = {
  workspace: FileText,
  runtime: Settings,
  skills: Wand2,
  crew: Users,
} as const
</script>

<template>
  <div class="config-center">
    <div class="split-layout">
      <aside class="config-nav" aria-label="配置模块">
        <nav class="config-nav__list">
          <button
            v-for="s in CONFIG_SECTIONS"
            :key="s.id"
            type="button"
            class="config-nav__item"
            :class="{ active: section === s.id }"
            @click="section = s.id"
          >
            <component :is="sectionIcon[s.id]" :size="16" class="config-nav__icon" aria-hidden="true" />
            <span class="config-nav__label">
              {{ s.label }}
              <span v-if="s.id === 'crew' && agentConfig.multiAgentEnabled" class="badge-on">ON</span>
            </span>
          </button>
        </nav>
      </aside>

      <section class="config-content card">
        <AgentPersonaPanel v-show="section === 'workspace'" />
        <AgentRuntimePanel v-show="section === 'runtime'" />
        <AgentSkillsPanel v-show="section === 'skills'" />
        <AgentCrewPanel v-show="section === 'crew'" />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.config-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px 24px;
}

.split-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 12px;
  min-height: 0;
}

.config-nav {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 4px 0;
}

.config-nav__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  color: $text-secondary;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;

  &:hover {
    color: $text-primary;
    background: color-mix(in srgb, $accent 6%, transparent);
  }

  &.active {
    color: $accent-emphasis;
    background: $accent-light;
    font-weight: 600;

    .config-nav__icon {
      opacity: 1;
    }
  }
}

.config-nav__icon {
  flex-shrink: 0;
  color: $accent;
  opacity: 0.7;
}

.config-nav__label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.badge-on {
  font-size: 9px;
  padding: 1px 5px;
  background: var(--btn-primary-gradient, $accent);
  color: #fff;
  border-radius: 4px;
  font-weight: 600;
}

.config-content {
  display: flex;
  flex-direction: column;
  min-height: 400px;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .split-layout {
    grid-template-columns: 1fr;
  }

  .config-nav {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid $border-light;
  }

  .config-nav__list {
    flex-direction: row;
    flex-wrap: wrap;
    flex: 1;
  }
}
</style>
