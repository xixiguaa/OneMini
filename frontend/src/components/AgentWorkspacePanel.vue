<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next'
import { ref } from 'vue'
import { WORKSPACE_FILES, WORKSPACE_ROOT } from '../config/workspaceFiles'
import { useAgentConfigStore } from '../stores/agentConfig'
import type { WorkspaceFileKey } from '../types/agentConfig'

const agentConfig = useAgentConfigStore()
const activeFile = ref<WorkspaceFileKey>('agents')

const current = () => WORKSPACE_FILES.find((f) => f.key === activeFile.value)!
</script>

<template>
  <div class="detail workspace-detail">
    <p class="hint">
      目录 <code>{{ WORKSPACE_ROOT }}</code> · 会话启动按序注入；策略请写在运行时，勿与此重复。
    </p>

    <div class="file-tabs">
      <button
        v-for="f in WORKSPACE_FILES"
        :key="f.key"
        type="button"
        class="file-tab"
        :class="{ active: activeFile === f.key }"
        @click="activeFile = f.key"
      >
        {{ f.filename }}
      </button>
    </div>

    <p class="file-hint">{{ current().hint }}</p>

    <textarea
      class="editor"
      :value="agentConfig.workspace[activeFile]"
      rows="16"
      spellcheck="false"
      @input="agentConfig.updateWorkspaceFile(activeFile, ($event.target as HTMLTextAreaElement).value)"
    />

    <button type="button" class="text-btn" @click="agentConfig.resetWorkspace()">
      <RotateCcw :size="12" />
      恢复工作区默认
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.workspace-detail {
  padding: 16px 20px 20px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.hint {
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
  margin-bottom: 12px;

  code {
    font-size: 11px;
    padding: 1px 5px;
    background: $bg-input;
    border-radius: 4px;
  }
}

.file-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.file-tab {
  padding: 6px 10px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  border-radius: 8px;
  border: 1px solid $border-light;
  color: $text-secondary;
  background: $bg-input;

  &.active {
    border-color: $accent;
    color: $accent;
    background: $accent-light;
    font-weight: 600;
  }
}

.file-hint {
  font-size: 12px;
  color: $text-muted;
  margin-bottom: 8px;
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
    color: #c44;
  }
}
</style>
