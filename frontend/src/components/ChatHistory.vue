<script setup lang="ts">
import { ChevronDown, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import LoadingIndicator from './LoadingIndicator.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useLocale } from '../composables/useLocale'
import { useAgentStore } from '../stores/agent'
import { useConversationsStore } from '../stores/conversations'
import { useUserAgentsStore } from '../stores/userAgents'

const agent = useAgentStore()
const conversations = useConversationsStore()
const userAgents = useUserAgentsStore()
const { t } = useLocale()

const deleteTargetId = ref<string | null>(null)
const deleting = ref(false)

const recentConversations = computed(() =>
  conversations.chatListForAgent(userAgents.activeAgentId),
)

const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel: confirmConfirmLabel,
  cancelLabel: confirmCancelLabel,
  danger: confirmDanger,
  loading: confirmLoading,
  confirm: showConfirm,
  onConfirm: onConfirmOk,
  onCancel: onConfirmCancel,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

function deleteTargetTitle() {
  const id = deleteTargetId.value
  if (!id) return ''
  return conversations.list.find((c) => c.id === id)?.title ?? '此对话'
}

function requestDeleteConversation(id: string) {
  deleteTargetId.value = id
  const title = conversations.list.find((c) => c.id === id)?.title ?? '此对话'
  void showConfirm({
    title: '删除对话',
    message: `确定删除「${title}」？\n\n对话记录将从服务端移除且无法恢复。`,
    confirmLabel: '删除',
    danger: true,
  })
}

async function onDeleteConfirm() {
  const id = deleteTargetId.value
  if (!id) return
  deleting.value = true
  try {
    await agent.deleteConversation(id)
    deleteTargetId.value = null
    onConfirmOk()
  } catch {
    /* persistError 已写入 store，保持弹框 */
  } finally {
    deleting.value = false
  }
}

function onDeleteCancel() {
  if (deleting.value) return
  deleteTargetId.value = null
  onConfirmCancel()
}

function selectAgent(agentId: string) {
  agent.startChatWithAgent(agentId)
}

function isConversationActive(convId: string) {
  return conversations.activeId === convId
}

function onAgentSwitch(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  if (id && id !== userAgents.activeAgentId) {
    selectAgent(id)
  }
}

function selectConversation(id: string) {
  agent.selectConversation(id)
}
</script>

<template>
  <section class="recents" aria-label="最近对话">
    <div class="recents-head">
      <span class="recents-title">{{ t('history.recents') }}</span>
      <div v-if="userAgents.agents.length > 1" class="agent-picker">
        <select
          class="agent-picker__select"
          :value="userAgents.activeAgentId"
          @change="onAgentSwitch"
        >
          <option v-for="item in userAgents.sortedAgents" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <ChevronDown :size="14" class="agent-picker__icon" aria-hidden="true" />
      </div>
    </div>

    <div class="recents-list">
      <template v-if="recentConversations.length">
        <div
          v-for="conv in recentConversations"
          :key="conv.id"
          class="recents-item"
          :class="{ active: isConversationActive(conv.id) }"
          role="button"
          tabindex="0"
          @click="selectConversation(conv.id)"
          @keydown.enter="selectConversation(conv.id)"
          @keydown.space.prevent="selectConversation(conv.id)"
        >
          <span class="recents-item__title">{{ conv.title }}</span>
          <button
            class="recents-item__delete"
            :title="t('history.delete')"
            :aria-label="t('history.delete')"
            @click.stop="requestDeleteConversation(conv.id)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </template>

      <LoadingIndicator
        v-else-if="conversations.loading"
        label="加载对话…"
        variant="block"
        class="recents-empty"
      />
      <p v-else class="recents-empty">{{ t('history.emptyForAgent') }}</p>
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage || `确定删除「${deleteTargetTitle()}」？`"
      :confirm-label="confirmConfirmLabel"
      :cancel-label="confirmCancelLabel"
      :danger="confirmDanger"
      :loading="confirmLoading || deleting"
      @update:open="onConfirmOpenUpdate"
      @confirm="onDeleteConfirm"
      @cancel="onDeleteCancel"
    />
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.recents {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.recents-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 12px;
}

.recents-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-label, $text-secondary);
}

.agent-picker {
  position: relative;
  flex-shrink: 1;
  min-width: 0;
  max-width: 52%;
}

.agent-picker__select {
  width: 100%;
  padding: 2px 22px 2px 0;
  border: none;
  background: transparent;
  color: var(--text-label, $text-secondary);
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  cursor: pointer;
  appearance: none;

  &:hover {
    color: $text-primary;
  }
}

.agent-picker__icon {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-label, $text-secondary);
  pointer-events: none;
}

.recents-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 6px;
}

.recents-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 50%, transparent);

    .recents-item__delete {
      opacity: 1;
    }
  }

  &.active {
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 72%, transparent);

    .recents-item__title {
      color: $text-primary;
      font-weight: 500;
    }
  }
}

.recents-item__title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--text-label, $text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recents-item__delete {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: $text-muted;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;

  &:hover {
    color: $color-danger;
    background: color-mix(in srgb, $color-danger 10%, transparent);
  }
}

.recents-empty {
  padding: 12px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: $text-muted;
  text-align: left;
}
</style>
