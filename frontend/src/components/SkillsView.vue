<script setup lang="ts">
import { Bot, Plus, Settings, Store, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import AgentPersonaPanel from './AgentPersonaPanel.vue'
import AgentSkillsPanel from './AgentSkillsPanel.vue'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useUserAgentsStore } from '../stores/userAgents'
import { CONFIG_SECTIONS, type AgentConfigSection } from '../types/agentConfig'

const userAgents = useUserAgentsStore()
const agentConfig = useAgentConfigStore()
const section = ref<AgentConfigSection>('config')

const activeAgent = computed(() => userAgents.activeAgent)

const sectionIcon = {
  config: Settings,
  store: Store,
} as const

function selectAgent(id: string) {
  userAgents.selectAgent(id)
}

function createAgent() {
  userAgents.createAgent()
  section.value = 'config'
}

function requestDeleteAgent(id: string) {
  if (userAgents.agents.length <= 1) return
  const agent = userAgents.getAgent(id)
  if (!agent) return
  if (!window.confirm(`确定删除智能体「${agent.name}」？其配置将无法恢复。`)) return
  userAgents.deleteAgent(id)
}
</script>

<template>
  <div class="agent-hub">
    <aside class="agent-list card" aria-label="智能体列表">
      <button type="button" class="create-agent-btn" @click="createAgent">
        <Plus :size="16" />
        新建智能体
      </button>

      <div class="agent-list__scroll">
        <div
          v-for="agent in userAgents.sortedAgents"
          :key="agent.id"
          class="agent-item"
          :class="{ active: userAgents.activeAgentId === agent.id }"
          role="button"
          tabindex="0"
          @click="selectAgent(agent.id)"
          @keydown.enter="selectAgent(agent.id)"
          @keydown.space.prevent="selectAgent(agent.id)"
        >
          <span class="agent-item__avatar" aria-hidden="true">{{ agent.avatar }}</span>
          <span class="agent-item__body">
            <span class="agent-item__name">{{ agent.name }}</span>
            <span v-if="agent.description" class="agent-item__desc">{{ agent.description }}</span>
          </span>
          <button
            v-if="userAgents.agents.length > 1"
            type="button"
            class="agent-item__delete"
            title="删除智能体"
            aria-label="删除智能体"
            @click.stop="requestDeleteAgent(agent.id)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
    </aside>

    <section class="agent-workspace card">
      <header v-if="activeAgent" class="workspace-head">
        <div class="workspace-title">
          <span class="workspace-avatar">{{ activeAgent.avatar }}</span>
          <div>
            <h2 class="workspace-name">{{ activeAgent.name }}</h2>
            <p v-if="activeAgent.description" class="workspace-desc">{{ activeAgent.description }}</p>
          </div>
        </div>

        <nav class="workspace-tabs" aria-label="智能体配置模块">
          <button
            v-for="s in CONFIG_SECTIONS"
            :key="s.id"
            type="button"
            class="workspace-tab"
            :class="{ active: section === s.id }"
            @click="section = s.id"
          >
            <component :is="sectionIcon[s.id]" :size="15" aria-hidden="true" />
            {{ s.label }}
            <span
              v-if="s.id === 'config' && agentConfig.multiAgentEnabled"
              class="badge-on"
            >
              协作
            </span>
          </button>
        </nav>
      </header>

      <div v-else class="workspace-empty">
        <Bot :size="40" />
        <p>请先新建或选择一个智能体</p>
        <button type="button" class="create-agent-btn create-agent-btn--inline" @click="createAgent">
          <Plus :size="16" />
          新建智能体
        </button>
      </div>

      <div v-if="activeAgent" class="workspace-content">
        <AgentPersonaPanel v-show="section === 'config'" />
        <AgentSkillsPanel v-show="section === 'store'" />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.agent-hub {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  min-height: 0;
  padding: 20px 24px;
}

.agent-list,
.agent-workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.agent-list {
  padding: 12px;
  gap: 10px;
}

.create-agent-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--btn-primary-gradient, $accent);
  border: none;
  flex-shrink: 0;

  &:hover {
    filter: brightness(1.05);
  }

  &--inline {
    width: auto;
    padding-inline: 16px;
  }
}

.agent-list__scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  color: $text-primary;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, $accent 6%, transparent);
  }

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 30%, transparent);

    .agent-item__name {
      color: $accent-emphasis;
      font-weight: 600;
    }
  }
}

.agent-item__avatar {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, $accent 10%, transparent);
  font-size: 16px;
  flex-shrink: 0;
}

.agent-item__body {
  flex: 1;
  min-width: 0;
}

.agent-item__name {
  display: block;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-item__desc {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-item__delete {
  padding: 4px;
  border-radius: 6px;
  color: $text-muted;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;

  .agent-item:hover & {
    opacity: 1;
  }

  &:hover {
    color: $color-danger;
    background: $color-danger-soft;
  }
}

.workspace-head {
  padding: 16px 20px 0;
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
}

.workspace-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.workspace-avatar {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, $accent 12%, transparent);
  font-size: 20px;
}

.workspace-name {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.workspace-desc {
  margin-top: 2px;
  font-size: 12px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 480px;
}

.workspace-tabs {
  display: flex;
  gap: 4px;
}

.workspace-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
  margin-bottom: -1px;

  &:hover {
    color: $text-primary;
  }

  &.active {
    color: $accent-emphasis;
    border-bottom-color: $accent;
    font-weight: 600;
  }
}

.badge-on {
  font-size: 9px;
  padding: 1px 5px;
  background: color-mix(in srgb, $accent 15%, transparent);
  color: $accent-emphasis;
  border-radius: 4px;
  font-weight: 600;
}

.workspace-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.workspace-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: $text-muted;
  font-size: 14px;

  svg {
    opacity: 0.35;
  }
}

@media (max-width: 900px) {
  .agent-hub {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .agent-list {
    max-height: 180px;
  }

  .agent-list__scroll {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .agent-item {
    min-width: 160px;
  }
}
</style>
