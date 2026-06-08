<script setup lang="ts">
import { AlignLeft, Download, FilePlus, RotateCcw } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  WORKSPACE_FILES,
  WORKSPACE_INJECT_PRIORITY_HINT,
} from '../config/workspaceFiles'
import { useAgentConfigStore } from '../stores/agentConfig'
import type { WorkspaceFileKey } from '../types/agentConfig'
import {
  formatMarkdownLists,
  scanWorkspaceSensitive,
  WORKSPACE_SNIPPETS,
} from '../utils/workspaceMarkdownHelpers'

withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  { embedded: false },
)

const emit = defineEmits<{
  manualEdit: []
}>()

const agentConfig = useAgentConfigStore()
const activeFile = ref<WorkspaceFileKey>('identity')
const showSnippetMenu = ref(false)
const sensitiveWarning = ref<string | null>(null)
const snippetWrapRef = ref<HTMLElement | null>(null)

const activeMeta = computed(() => WORKSPACE_FILES.find((f) => f.key === activeFile.value)!)
const activeSnippets = computed(() => WORKSPACE_SNIPPETS[activeFile.value] ?? [])

function onEditorInput(key: WorkspaceFileKey, value: string) {
  agentConfig.updateWorkspaceFile(key, value)
  checkSensitive()
  emit('manualEdit')
}

function checkSensitive() {
  const hits = scanWorkspaceSensitive(agentConfig.workspace)
  sensitiveWarning.value = hits.length
    ? `检测到可能的敏感信息（${hits.map((h) => h.label).join('、')}），请确认后再保存。`
    : null
}

function insertSnippet(content: string) {
  const current = agentConfig.workspace[activeFile.value]
  const sep = current.trim() ? '\n\n' : ''
  onEditorInput(activeFile.value, current + sep + content)
  showSnippetMenu.value = false
}

function formatCurrent() {
  const formatted = formatMarkdownLists(agentConfig.workspace[activeFile.value])
  onEditorInput(activeFile.value, formatted)
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(agentConfig.bundle, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `onemini-agent-config-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function onDocClick(e: MouseEvent) {
  if (!snippetWrapRef.value?.contains(e.target as Node)) {
    showSnippetMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

checkSensitive()
</script>

<template>
  <div class="detail workspace-detail" :class="{ 'workspace-detail--embedded': embedded }">
    <p class="priority-hint">{{ WORKSPACE_INJECT_PRIORITY_HINT }}</p>

    <div v-if="sensitiveWarning" class="sensitive-banner" role="alert">
      {{ sensitiveWarning }}
    </div>

    <div class="file-tabs">
      <button
        v-for="f in WORKSPACE_FILES"
        :key="f.key"
        type="button"
        class="file-tab"
        :class="{ active: activeFile === f.key, 'file-tab--synced': f.formSynced }"
        @click="activeFile = f.key"
      >
        <span class="file-tab-icon">{{ f.icon }}</span>
        <span class="file-tab-label">{{ f.displayLabel }}</span>
        <span class="file-tab-filename">{{ f.filename }}</span>
      </button>
    </div>

    <div class="file-meta">
      <span class="file-meta-title">{{ activeMeta.icon }} {{ activeMeta.displayLabel }}</span>
      <span class="file-meta-hint">{{ activeMeta.hint }}</span>
      <span v-if="activeMeta.formSynced" class="file-meta-badge">表单同步</span>
    </div>

    <div class="editor-toolbar">
      <div ref="snippetWrapRef" class="snippet-wrap">
        <button
          type="button"
          class="toolbar-btn"
          :class="{ 'toolbar-btn--open': showSnippetMenu }"
          :disabled="!activeSnippets.length"
          @click.stop="showSnippetMenu = !showSnippetMenu"
        >
          <FilePlus :size="14" />
          插入模板
        </button>
        <div v-if="showSnippetMenu && activeSnippets.length" class="snippet-menu">
          <button
            v-for="s in activeSnippets"
            :key="s.label"
            type="button"
            class="snippet-item"
            @click="insertSnippet(s.content)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <button type="button" class="toolbar-btn" @click="formatCurrent">
        <AlignLeft :size="14" />
        格式化列表
      </button>
      <button type="button" class="toolbar-btn" @click="exportConfig">
        <Download :size="14" />
        导出配置
      </button>
    </div>

    <textarea
      class="editor"
      :value="agentConfig.workspace[activeFile]"
      rows="16"
      spellcheck="false"
      @input="onEditorInput(activeFile, ($event.target as HTMLTextAreaElement).value)"
    />

    <button v-if="!embedded" type="button" class="text-btn" @click="agentConfig.resetWorkspace()">
      <RotateCcw :size="12" />
      恢复默认设定
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.workspace-detail {
  padding: 16px 20px 20px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;

  &--embedded {
    padding: 12px 0 0;
  }
}

.priority-hint {
  font-size: 11px;
  line-height: 1.45;
  color: $text-muted;
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, $accent 5%, $bg-input);
  border: 1px solid color-mix(in srgb, $accent 12%, $border-light);
}

.sensitive-banner {
  font-size: 12px;
  color: color-mix(in srgb, $color-danger 85%, $text-primary);
  background: $color-danger-soft;
  border: 1px solid color-mix(in srgb, $color-danger 25%, transparent);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
}

.file-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.file-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid $border-light;
  color: $text-secondary;
  background: $bg-input;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: color-mix(in srgb, $accent 30%, $border-light);
  }

  &.active {
    border-color: $accent;
    background: $accent-light;
  }
}

.file-tab-icon {
  font-size: 14px;
  line-height: 1;
}

.file-tab-label {
  font-size: 12px;
  font-weight: 600;
  color: $text-primary;

  .active & {
    color: $accent-emphasis;
  }
}

.file-tab-filename {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: $text-muted;
}

.file-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.file-meta-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.file-meta-hint {
  font-size: 11px;
  color: $text-muted;
  flex: 1;
  min-width: 160px;
}

.file-meta-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, $accent 10%, transparent);
  color: $accent-emphasis;
  border: 1px solid color-mix(in srgb, $accent 20%, transparent);
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.snippet-wrap {
  position: relative;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, $accent 35%, $border-light);
    color: $accent-emphasis;
  }

  &--open {
    border-color: $accent;
    color: $accent-emphasis;
    background: $accent-light;
    box-shadow: $shadow-focus;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.snippet-menu {
  @include cosmic.cosmic-glass-dropdown-menu(12px);
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  min-width: 168px;
}

.snippet-item {
  @include cosmic.cosmic-glass-dropdown-option;
  font-size: 12px;
}

.editor {
  flex: 1;
  width: 100%;
  min-height: 280px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.55;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  color: $text-primary;
  resize: vertical;

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
  }
}

.text-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
  color: $text-muted;

  &:hover {
    color: $color-danger;
  }
}
</style>
