<script setup lang="ts">
import { CircleSlash, GitBranch, Database } from 'lucide-vue-next'
import { usePlatformStore, type KnowledgeChatMode } from '../stores/platform'

const platform = usePlatformStore()

const options: { id: KnowledgeChatMode; label: string; desc: string; icon: typeof Database }[] = [
  {
    id: 'off',
    label: '关闭增强',
    desc: '纯模型对话，不检索知识库',
    icon: CircleSlash,
  },
  {
    id: 'rag',
    label: 'Milvus RAG',
    desc: '向量分块检索，适合快速问答',
    icon: Database,
  },
  {
    id: 'wiki',
    label: 'LLM-Wiki',
    desc: '结构化 wiki 页检索，适合综合研究',
    icon: GitBranch,
  },
]
</script>

<template>
  <fieldset class="mode-picker">
    <legend class="mode-legend">对话页知识增强</legend>
    <div class="mode-options">
      <label
        v-for="opt in options"
        :key="opt.id"
        class="mode-option"
        :class="{ active: platform.knowledgeChatMode === opt.id }"
      >
        <input
          type="radio"
          name="knowledge-chat-mode"
          :value="opt.id"
          :checked="platform.knowledgeChatMode === opt.id"
          @change="platform.setKnowledgeChatMode(opt.id)"
        />
        <component :is="opt.icon" :size="16" class="mode-icon" />
        <span class="mode-text">
          <span class="mode-label">{{ opt.label }}</span>
          <span class="mode-desc">{{ opt.desc }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.mode-picker {
  margin: 0 0 16px;
  padding: 0;
  border: none;
}

.mode-legend {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0 0 8px;
}

.mode-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mode-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid $glass-border;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  &:hover {
    border-color: $accent;
    background: $accent-light;
  }

  &.active {
    border-color: $accent;
    background: $accent-light;
    box-shadow: inset $active-indicator 0 0 $accent;
  }
}

.mode-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: $accent;
}

.mode-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mode-label {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.mode-desc {
  font-size: 11px;
  line-height: 1.4;
  color: $text-muted;
}
</style>
