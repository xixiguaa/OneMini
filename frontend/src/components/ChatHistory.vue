<script setup lang="ts">
import { EyeOff, MessageSquare, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import LoadingIndicator from './LoadingIndicator.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useLocale } from '../composables/useLocale'
import { useAgentStore } from '../stores/agent'
import { useConversationsStore } from '../stores/conversations'
import { useUserAgentsStore } from '../stores/userAgents'
import type { ConversationTimeGroup } from '../types/agent'

const agent = useAgentStore()
const conversations = useConversationsStore()
const userAgents = useUserAgentsStore()
const { t } = useLocale()

const deleteTargetId = ref<string | null>(null)
const deleting = ref(false)

const groupedList = computed(() =>
  conversations.groupedListForAgent(userAgents.activeAgentId),
)

const activeAgentConversations = computed(() =>
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

function groupLabel(key: ConversationTimeGroup): string {
  return t(`history.groups.${key}`)
}

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

function conversationCount(agentId: string) {
  return conversations.conversationCountForAgent(agentId)
}

function isConversationActive(convId: string) {
  return !conversations.isIncognito && conversations.activeId === convId
}
</script>

<template>
  <div class="history">
    <section class="agents-section">
      <div class="section-label">{{ t('history.agentsLabel') }}</div>
      <div class="agent-list">
        <button
          v-for="item in userAgents.sortedAgents"
          :key="item.id"
          type="button"
          class="agent-row"
          :class="{ active: userAgents.activeAgentId === item.id && !conversations.isIncognito }"
          @click="selectAgent(item.id)"
        >
          <span class="agent-row__avatar">{{ item.avatar }}</span>
          <span class="agent-row__body">
            <span class="agent-row__name">{{ item.name }}</span>
            <span class="agent-row__meta">
              {{ conversationCount(item.id) }} {{ t('history.conversations') }}
            </span>
          </span>
        </button>
      </div>
    </section>

    <section class="conversations-section">
      <div class="section-label">{{ t('history.label') }}</div>
      <div
        v-if="conversations.isIncognito"
        class="incognito-pill"
        role="status"
      >
        <EyeOff :size="12" />
        <span>{{ t('history.incognitoActive') }}</span>
      </div>
      <div class="history-list" :class="{ dimmed: conversations.isIncognito }">
        <template v-if="groupedList.length">
          <section
            v-for="group in groupedList"
            :key="group.key"
            class="history-group"
          >
            <div class="group-label">{{ groupLabel(group.key) }}</div>
            <div
              v-for="conv in group.conversations"
              :key="conv.id"
              class="history-item"
              :class="{ active: isConversationActive(conv.id) }"
              role="button"
              tabindex="0"
              @click="agent.selectConversation(conv.id)"
              @keydown.enter="agent.selectConversation(conv.id)"
              @keydown.space.prevent="agent.selectConversation(conv.id)"
            >
              <div class="item-body">
                <span class="item-title">{{ conv.title }}</span>
              </div>
              <button
                class="delete-btn"
                :title="t('history.delete')"
                @click.stop="requestDeleteConversation(conv.id)"
              >
                <Trash2 :size="12" />
              </button>
            </div>
          </section>
        </template>

        <LoadingIndicator
          v-if="conversations.loading"
          label="加载对话…"
          variant="block"
          class="empty"
        />
        <p v-else-if="!activeAgentConversations.length" class="empty">
          <MessageSquare :size="14" class="empty-icon" />
          {{ t('history.emptyForAgent') }}
        </p>
      </div>
    </section>

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
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-label, $text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 8px 8px;
}

.agents-section {
  flex-shrink: 0;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: $radius-sm;
  text-align: left;
  cursor: pointer;
  @include cosmic.cosmic-interactive-item;

  &.active {
    @include cosmic.cosmic-interactive-item-active;

    .agent-row__name {
      color: $accent-emphasis;
      font-weight: 600;
    }
  }
}

.agent-row__avatar {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, $accent 10%, transparent);
  font-size: 14px;
  flex-shrink: 0;
}

.agent-row__body {
  flex: 1;
  min-width: 0;
}

.agent-row__name {
  display: block;
  font-size: 13px;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-row__meta {
  display: block;
  margin-top: 1px;
  font-size: 11px;
  color: $text-muted;
}

.conversations-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.incognito-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 4px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  color: $accent-emphasis;
  background: $accent-light;
  border: var(--glass-border-width, 0.5px) solid $border-light;

  svg {
    flex-shrink: 0;
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &.dimmed {
    opacity: 0.55;
  }
}

.history-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-label, $text-secondary);
  padding: 4px 10px 2px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  text-align: left;
  width: 100%;
  cursor: pointer;
  @include cosmic.cosmic-interactive-item;

  &.active {
    @include cosmic.cosmic-interactive-item-active;

    .item-title {
      color: $accent-emphasis;
      font-weight: 600;
    }
  }
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-title {
  display: block;
  font-size: 13px;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-btn {
  @include cosmic.cosmic-secondary-action;
  padding: 4px;
  color: $text-muted;
  border-radius: 4px;
  flex-shrink: 0;

  &:hover {
    color: $color-danger;
    background: rgba(200, 68, 68, 0.1);
  }
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: $text-muted;
  text-align: center;
  padding: 16px 8px;
}

.empty-icon {
  opacity: 0.45;
}
</style>
