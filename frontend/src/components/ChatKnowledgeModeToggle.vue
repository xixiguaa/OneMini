<script setup lang="ts">
import { ChevronDown, CircleSlash, Database, GitBranch } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
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

const wrapRef = ref<HTMLElement | null>(null)
const showMenu = ref(false)

const current = computed(
  () => options.find((o) => o.id === platform.knowledgeChatMode) ?? options[0],
)

function toggleMenu(e: MouseEvent) {
  e.stopPropagation()
  showMenu.value = !showMenu.value
}

function pickMode(id: KnowledgeChatMode) {
  platform.setKnowledgeChatMode(id)
  showMenu.value = false
}

function onDocClick(e: MouseEvent) {
  if (!wrapRef.value?.contains(e.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="wrapRef" class="knowledge-mode-wrap">
    <button
      type="button"
      class="knowledge-mode-btn"
      :class="{ active: platform.knowledgeChatMode !== 'off' }"
      :title="current.desc"
      @click="toggleMenu"
    >
      <component :is="current.icon" :size="14" />
      <span class="label">{{ current.label }}</span>
      <ChevronDown :size="12" class="chevron" :class="{ open: showMenu }" />
    </button>

    <div v-if="showMenu" class="knowledge-mode-menu" @click.stop>
      <button
        v-for="opt in options"
        :key="opt.id"
        type="button"
        class="menu-item"
        :class="{ active: platform.knowledgeChatMode === opt.id }"
        @click="pickMode(opt.id)"
      >
        <component :is="opt.icon" :size="16" class="item-icon" />
        <span class="item-text">
          <span class="item-label">{{ opt.label }}</span>
          <span class="item-desc">{{ opt.desc }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.knowledge-mode-wrap {
  position: relative;
  flex-shrink: 0;
}

.knowledge-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 140px;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 12px;
  color: var(--composer-muted);
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--composer-picker-hover);
    color: var(--composer-text);
  }

  &.active {
    color: $accent;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    flex-shrink: 0;
    opacity: 0.55;
    transition: transform 0.2s;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.knowledge-mode-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
  padding: 6px;
  background: var(--composer-menu-bg);
  border: 1px solid var(--composer-border);
  border-radius: 12px;
  box-shadow: $shadow-md;
}

.menu-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  color: var(--composer-menu-text);

  &:hover {
    background: var(--composer-option-hover);
  }

  &.active {
    background: var(--composer-option-hover);
  }

  .item-icon {
    flex-shrink: 0;
    margin-top: 1px;
    color: $accent;
  }

  .item-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .item-label {
    font-size: 13px;
    font-weight: 600;
  }

  .item-desc {
    font-size: 11px;
    line-height: 1.4;
    color: $text-muted;
  }
}
</style>
