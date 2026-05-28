<script setup lang="ts">
import { EyeOff, Trash2 } from 'lucide-vue-next'
import LoadingIndicator from './LoadingIndicator.vue'
import { useLocale } from '../composables/useLocale'
import { useAgentStore } from '../stores/agent'
import { useConversationsStore } from '../stores/conversations'

const agent = useAgentStore()
const conversations = useConversationsStore()
const { t } = useLocale()

</script>

<template>
  <div class="history">
    <div class="history-label">{{ t('history.label') }}</div>
    <div
      v-if="conversations.isIncognito"
      class="incognito-pill"
      role="status"
    >
      <EyeOff :size="12" />
      <span>{{ t('history.incognitoActive') }}</span>
    </div>
    <div class="history-list" :class="{ dimmed: conversations.isIncognito }">
      <div
        v-for="conv in conversations.sortedList"
        :key="conv.id"
        class="history-item"
        :class="{ active: !conversations.isIncognito && conversations.activeId === conv.id }"
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
          @click.stop="agent.deleteConversation(conv.id)"
        >
          <Trash2 :size="12" />
        </button>
      </div>
      <LoadingIndicator
        v-if="conversations.loading"
        label="加载对话…"
        variant="block"
        class="empty"
      />
      <p v-else-if="!conversations.sortedList.length" class="empty">{{ t('history.empty') }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.history-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 8px 8px;
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
  color: #5a4a78;
  background: rgba(90, 70, 140, 0.12);
  border: 1px solid rgba(90, 70, 140, 0.28);

  svg {
    flex-shrink: 0;
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &.dimmed {
    opacity: 0.55;
  }
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  text-align: left;
  width: 100%;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: $accent-light;
    border-color: $glass-border;

    .delete-btn {
      opacity: 1;
    }
  }

  &.active {
    background: $accent-light;
    border-color: rgba(45, 138, 78, 0.35);
    box-shadow: inset $active-indicator 0 0 $accent;

    .item-title {
      color: $accent;
      font-weight: 600;
    }
  }
}

.item-icon {
  color: $accent-magic;
  flex-shrink: 0;
}

.item-body {
  flex: 1;
  min-width: 0;
}

.item-title {
  display: block;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  font-size: 10px;
  color: $text-muted;
}

.delete-btn {
  opacity: 0;
  padding: 4px;
  color: $text-muted;
  border-radius: 4px;
  flex-shrink: 0;

  &:hover {
    color: #c44;
    background: rgba(200, 68, 68, 0.1);
  }
}

.empty {
  font-size: 12px;
  color: $text-muted;
  text-align: center;
  padding: 16px 8px;
}
</style>
