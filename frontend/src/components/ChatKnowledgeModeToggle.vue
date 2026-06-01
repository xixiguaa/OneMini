<script setup lang="ts">
import { Atom, ChevronDown, CircleSlash, Database, GitBranch, Globe } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { usePlatformStore, type KnowledgeChatMode } from '../stores/platform'

const platform = usePlatformStore()

const knowledgeOptions: {
  id: KnowledgeChatMode
  label: string
  desc: string
  icon: typeof Database
}[] = [
  {
    id: 'off',
    label: '关闭知识库',
    desc: '不检索本地知识库',
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
    desc: '结构化 wiki 页检索',
    icon: GitBranch,
  },
]

const btnRef = ref<HTMLElement | null>(null)
const showMenu = ref(false)
const menuStyle = ref<Record<string, string>>({})

const currentKnowledge = computed(
  () => knowledgeOptions.find((o) => o.id === platform.knowledgeChatMode) ?? knowledgeOptions[0],
)

function updateMenuPosition() {
  const el = btnRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  menuStyle.value = {
    position: 'fixed',
    left: `${r.left}px`,
    bottom: `${window.innerHeight - r.top + 8}px`,
    zIndex: '9999',
    minWidth: `${Math.max(r.width, 240)}px`,
  }
}

function toggleDeepThinking() {
  platform.setDeepThinkingEnabled(!platform.deepThinkingEnabled)
}

function toggleWebSearch() {
  platform.setWebSearchEnabled(!platform.webSearchEnabled)
}

function toggleKnowledgeMenu(e: MouseEvent) {
  e.stopPropagation()
  showMenu.value = !showMenu.value
  if (showMenu.value) {
    void nextTick(updateMenuPosition)
  }
}

function pickKnowledge(id: KnowledgeChatMode) {
  platform.setKnowledgeChatMode(id)
  showMenu.value = false
}

function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (btnRef.value?.contains(t)) return
  const portal = document.getElementById('knowledge-mode-menu-portal')
  if (portal?.contains(t)) return
  showMenu.value = false
}

function onResize() {
  if (showMenu.value) updateMenuPosition()
}

watch(showMenu, (open) => {
  if (open) void nextTick(updateMenuPosition)
})

onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onResize, true)
})
</script>

<template>
  <div class="enhance-toggles">
    <button
      type="button"
      class="enhance-pill"
      :class="{ on: platform.deepThinkingEnabled }"
      title="分步推理、更深入分析"
      @click.stop="toggleDeepThinking"
    >
      <Atom :size="14" />
      <span>深度思考</span>
    </button>

    <button
      type="button"
      class="enhance-pill"
      :class="{ on: platform.webSearchEnabled }"
      title="联网检索摘要后作答"
      @click.stop="toggleWebSearch"
    >
      <Globe :size="14" />
      <span>联网搜索</span>
    </button>

    <button
      ref="btnRef"
      type="button"
      class="enhance-pill knowledge-pill"
      :class="{ on: platform.knowledgeChatMode !== 'off' }"
      :title="currentKnowledge.desc"
      @click="toggleKnowledgeMenu"
    >
      <component :is="currentKnowledge.icon" :size="14" />
      <span class="k-label">{{ currentKnowledge.label }}</span>
      <ChevronDown :size="12" class="chevron" :class="{ open: showMenu }" />
    </button>

    <Teleport to="body">
      <div
        v-if="showMenu"
        id="knowledge-mode-menu-portal"
        class="knowledge-mode-menu"
        :style="menuStyle"
        @click.stop
      >
        <button
          v-for="opt in knowledgeOptions"
          :key="opt.id"
          type="button"
          class="menu-item"
          :class="{ active: platform.knowledgeChatMode === opt.id }"
          @click="pickKnowledge(opt.id)"
        >
          <component :is="opt.icon" :size="16" class="item-icon" />
          <span class="item-text">
            <span class="item-label">{{ opt.label }}</span>
            <span class="item-desc">{{ opt.desc }}</span>
          </span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.enhance-toggles {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.enhance-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--composer-muted);
  border: 1px solid var(--composer-pill-border, $border-light);
  background: transparent;
  flex-shrink: 0;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;

  &:hover {
    background: var(--composer-picker-hover);
    color: var(--composer-text);
  }

  &.on {
    color: $accent;
    border-color: color-mix(in srgb, $accent 45%, transparent);
    background: color-mix(in srgb, $accent 10%, transparent);
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

.knowledge-pill .k-label {
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<!-- Teleport 菜单样式（非 scoped，挂到 body） -->
<style lang="scss">
@use '../styles/variables.scss' as *;

#knowledge-mode-menu-portal.knowledge-mode-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--composer-menu-bg, #fff);
  border: 1px solid var(--composer-border, #{$border-light});
  border-radius: 12px;
  box-shadow: $shadow-md;
}

#knowledge-mode-menu-portal .menu-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  color: var(--composer-menu-text, #{$text-primary});

  &:hover {
    background: var(--composer-option-hover, #{$accent-light});
  }

  &.active {
    background: var(--composer-option-hover, #{$accent-light});
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
