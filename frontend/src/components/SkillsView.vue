<script setup lang="ts">
import { FlaskConical, Plus, Settings, Sparkles, Store, Trash2 } from 'lucide-vue-next'
import { computed, onUnmounted, ref, watch } from 'vue'
import AgentAvatar from './AgentAvatar.vue'
import AgentConfigSandbox from './AgentConfigSandbox.vue'
import AgentPersonaPanel from './AgentPersonaPanel.vue'
import AgentSkillsPanel from './AgentSkillsPanel.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useUserAgentsStore } from '../stores/userAgents'
import { CONFIG_SECTIONS, type AgentConfigSection } from '../types/agentConfig'

const userAgents = useUserAgentsStore()
const agentConfig = useAgentConfigStore()
const section = ref<AgentConfigSection>('config')
const deleteTargetId = ref<string | null>(null)
const sandboxOpen = ref(false)

const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel: confirmConfirmLabel,
  cancelLabel: confirmCancelLabel,
  danger: confirmDanger,
  confirm: showConfirm,
  close: closeConfirm,
  onCancel: onConfirmCancel,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

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
  deleteTargetId.value = id
  void showConfirm({
    title: '删除智能体',
    message: `确定删除「${agent.name}」？\n\n其配置将无法恢复。`,
    confirmLabel: '删除',
    danger: true,
  })
}

function onConfirmDeleteAgent() {
  const id = deleteTargetId.value
  if (!id) {
    closeConfirm(false)
    return
  }
  userAgents.deleteAgent(id)
  deleteTargetId.value = null
  closeConfirm(true)
}

function onCancelDeleteAgent() {
  deleteTargetId.value = null
  onConfirmCancel()
}

function openSandbox() {
  sandboxOpen.value = true
}

function closeSandbox() {
  sandboxOpen.value = false
}

watch(sandboxOpen, (visible) => {
  document.body.style.overflow = visible ? 'hidden' : ''
})

watch(section, (id) => {
  if (id !== 'config') sandboxOpen.value = false
})

onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="agent-hub">
    <section class="agent-workspace card">
      <header v-if="activeAgent" class="workspace-bar">
        <nav class="section-switch" aria-label="智能体配置模块">
          <button
            v-for="s in CONFIG_SECTIONS"
            :key="s.id"
            type="button"
            class="section-switch__btn"
            :class="{ active: section === s.id }"
            @click="section = s.id"
          >
            <component :is="sectionIcon[s.id]" :size="14" aria-hidden="true" />
            {{ s.label }}
            <span
              v-if="s.id === 'config' && agentConfig.multiAgentEnabled"
              class="badge-on"
            >
              协作
            </span>
          </button>
        </nav>

        <nav
          v-if="userAgents.agents.length > 1"
          class="agent-picker"
          aria-label="智能体列表"
        >
          <div
            v-for="agent in userAgents.sortedAgents"
            :key="agent.id"
            class="agent-chip"
            :class="{ active: userAgents.activeAgentId === agent.id }"
            role="button"
            tabindex="0"
            @click="selectAgent(agent.id)"
            @keydown.enter="selectAgent(agent.id)"
            @keydown.space.prevent="selectAgent(agent.id)"
          >
            <AgentAvatar :name="agent.name" :id="agent.id" :avatar="agent.avatar" size="sm" />
            <span class="agent-chip__name">{{ agent.name }}</span>
            <button
              type="button"
              class="agent-chip__delete"
              title="删除智能体"
              aria-label="删除智能体"
              @click.stop="requestDeleteAgent(agent.id)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </nav>

        <div class="workspace-actions">
          <button
            v-if="section === 'config'"
            type="button"
            class="sandbox-trigger"
            :class="{ active: sandboxOpen }"
            @click="openSandbox"
          >
            <FlaskConical :size="15" />
            沙盒测试
          </button>
          <button
            type="button"
            class="icon-action"
            title="新建智能体"
            aria-label="新建智能体"
            @click="createAgent"
          >
            <Plus :size="15" />
          </button>
        </div>
      </header>

      <div v-else class="workspace-empty">
        <Sparkles :size="36" class="workspace-empty__icon" />
        <p>请先新建或选择一个智能体</p>
        <button type="button" class="create-agent-btn create-agent-btn--inline" @click="createAgent">
          <Plus :size="16" />
          新建智能体
        </button>
      </div>

      <div
        v-if="activeAgent"
        class="workspace-content"
        :class="{ 'workspace-content--config': section === 'config' }"
      >
        <AgentPersonaPanel v-show="section === 'config'" />
        <AgentSkillsPanel v-show="section === 'store'" />
      </div>
    </section>

    <Teleport to="body">
      <Transition name="sandbox-drawer-fade">
        <div
          v-if="sandboxOpen && activeAgent && section === 'config'"
          class="sandbox-drawer-overlay"
          role="presentation"
          @click.self="closeSandbox"
        >
          <Transition name="sandbox-drawer-slide">
            <aside
              v-if="sandboxOpen"
              class="sandbox-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="配置沙盒测试"
            >
              <AgentConfigSandbox
                class="sandbox-drawer__panel"
                closable
                @close="closeSandbox"
              />
            </aside>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmConfirmLabel"
      :cancel-label="confirmCancelLabel"
      :danger="confirmDanger"
      @update:open="onConfirmOpenUpdate"
      @confirm="onConfirmDeleteAgent"
      @cancel="onCancelDeleteAgent"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.agent-hub {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 18px 16px 12px;
}

.agent-workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  flex: 1;
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

  &--compact {
    width: auto;
    padding: 8px 14px;
    font-size: 12px;
    flex-shrink: 0;
  }
}

.workspace-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 6px;
  flex-shrink: 0;
  min-height: 0;
}

.workspace-content--config .workspace-bar {
  background: color-mix(in srgb, $bg-input 35%, transparent);
}

.section-switch {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: color-mix(in srgb, $bg-input 70%, transparent);
  border: 1px solid $border-light;
  flex-shrink: 0;
}

.section-switch__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  border: none;
  background: transparent;

  &:hover {
    color: $text-primary;
  }

  &.active {
    color: $accent-emphasis;
    background: var(--bg-card);
    box-shadow: $shadow-sm;
    font-weight: 600;
  }
}

.workspace-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.sandbox-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  border: 1px solid $border-light;
  background: var(--bg-card);

  &:hover,
  &.active {
    color: $accent-emphasis;
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 20%, transparent);
  }
}

.icon-action {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: $text-muted;
  border: 1px solid transparent;

  &:hover {
    color: $accent-emphasis;
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 20%, transparent);
  }
}

.agent-picker {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  min-width: 0;
  flex: 1;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    height: 4px;
  }
}

.agent-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 6px;
  border-radius: 999px;
  border: 1px solid $border-light;
  background: color-mix(in srgb, var(--bg-card) 85%, transparent);
  color: $text-secondary;
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;

  &:hover {
    border-color: color-mix(in srgb, $accent 25%, $border-light);
    color: $text-primary;
  }

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 35%, transparent);
    color: $accent-emphasis;
    font-weight: 600;
  }
}

.agent-chip__name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-chip__delete {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: $text-muted;
  opacity: 0;
  transition: opacity 0.15s;

  .agent-chip:hover & {
    opacity: 1;
  }

  &:hover {
    color: $color-danger;
    background: $color-danger-soft;
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

  &__icon {
    color: $accent;
    opacity: 0.55;
  }
}

.sandbox-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2800;
  background: color-mix(in srgb, var(--bg-page) 55%, transparent);
  backdrop-filter: blur(var(--glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px));
}

.sandbox-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 2801;
  display: flex;
  flex-direction: column;
  width: min(420px, 100vw);
  height: 100%;
  background: $glass-bg;
  backdrop-filter: blur(var(--glass-blur, 24px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px));
  border-left: var(--glass-border-width, 0.5px) solid $glass-border;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.18), var(--glass-float-shadow, $shadow-md);
}

.sandbox-drawer__panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sandbox-drawer-fade-enter-active,
.sandbox-drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.sandbox-drawer-fade-enter-from,
.sandbox-drawer-fade-leave-to {
  opacity: 0;
}

.sandbox-drawer-slide-enter-active,
.sandbox-drawer-slide-leave-active {
  transition: transform 0.24s ease;
}

.sandbox-drawer-slide-enter-from,
.sandbox-drawer-slide-leave-to {
  transform: translateX(100%);
}

@media (max-width: 900px) {
  .agent-hub {
    padding: 12px;
  }
}
</style>
