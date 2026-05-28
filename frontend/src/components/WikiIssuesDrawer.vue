<script setup lang="ts">
import { X } from 'lucide-vue-next'
import LoadingIndicator from './LoadingIndicator.vue'
import { computed, onUnmounted, watch } from 'vue'
import type { WikiConflictResolution, WikiIngestConflict, WikiIngestStatus } from '../api/wiki'

const props = defineProps<{
  open: boolean
  tab: 'conflicts' | 'errors'
  conflicts: WikiIngestConflict[]
  errors: WikiIngestStatus['errors']
  resolvingConflictId: string | null
  ingestActive: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:tab': [value: 'conflicts' | 'errors']
  resolve: [id: string, resolution: WikiConflictResolution]
  retry: []
}>()

const conflictCount = computed(() => props.conflicts.length)
const errorCount = computed(() => props.errors?.length ?? 0)

function close() {
  emit('update:open', false)
}

function shortRawPath(raw?: string) {
  if (!raw) return ''
  const name = raw.split('/').pop() ?? raw
  return name.length > 48 ? `${name.slice(0, 45)}…` : name
}

watch(
  () => props.open,
  (visible) => {
    document.body.style.overflow = visible ? 'hidden' : ''
  },
)

onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="wiki-drawer-fade">
      <div
        v-if="open"
        class="wiki-drawer-overlay"
        role="presentation"
        @click.self="close"
      >
        <Transition name="wiki-drawer-slide">
          <aside
            v-if="open"
            class="wiki-drawer"
            role="dialog"
            aria-modal="true"
            :aria-label="tab === 'conflicts' ? '内容冲突' : '构建失败详情'"
          >
            <header class="wiki-drawer-head">
              <h2 class="wiki-drawer-title">构建任务</h2>
              <button type="button" class="wiki-drawer-close" aria-label="关闭" @click="close">
                <X :size="18" />
              </button>
            </header>

            <div class="wiki-drawer-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                class="wiki-drawer-tab"
                :class="{ active: tab === 'conflicts' }"
                :aria-selected="tab === 'conflicts'"
                :disabled="!conflictCount"
                @click="emit('update:tab', 'conflicts')"
              >
                内容冲突
                <span v-if="conflictCount" class="wiki-drawer-badge warn">{{ conflictCount }}</span>
              </button>
              <button
                type="button"
                role="tab"
                class="wiki-drawer-tab"
                :class="{ active: tab === 'errors' }"
                :aria-selected="tab === 'errors'"
                :disabled="!errorCount"
                @click="emit('update:tab', 'errors')"
              >
                构建失败
                <span v-if="errorCount" class="wiki-drawer-badge danger">{{ errorCount }}</span>
              </button>
            </div>

            <div class="wiki-drawer-body">
              <template v-if="tab === 'conflicts'">
                <p v-if="!conflictCount" class="wiki-drawer-empty">暂无待处理冲突</p>
                <p v-else class="wiki-drawer-hint">
                  新 ingest 与已有 wiki 页正文差异较大。请为每一项选择处理方式。
                </p>
                <ul v-if="conflictCount" class="conflict-list">
                  <li
                    v-for="c in conflicts"
                    :key="c.id"
                    class="conflict-item"
                    :class="{
                      'is-processing': resolvingConflictId === c.id,
                      'is-waiting': !!resolvingConflictId && resolvingConflictId !== c.id,
                    }"
                  >
                    <div class="conflict-meta">
                      <strong>{{ c.title }}</strong>
                      <span class="conflict-path">{{ c.wiki_path }}</span>
                      <span class="conflict-sim">相似度 {{ (c.similarity * 100).toFixed(0) }}%</span>
                      <LoadingIndicator
                        v-if="resolvingConflictId === c.id"
                        label="处理中…"
                        variant="inline"
                        :size="12"
                        class="conflict-status"
                      />
                    </div>
                    <div class="conflict-actions">
                      <button
                        type="button"
                        class="conflict-btn"
                        :disabled="resolvingConflictId === c.id"
                        @click.stop="emit('resolve', c.id, 'overwrite')"
                      >
                        覆盖
                      </button>
                      <button
                        type="button"
                        class="conflict-btn"
                        :disabled="resolvingConflictId === c.id"
                        @click.stop="emit('resolve', c.id, 'keep_both')"
                      >
                        保留双方
                      </button>
                      <button
                        type="button"
                        class="conflict-btn muted"
                        :disabled="resolvingConflictId === c.id"
                        @click.stop="emit('resolve', c.id, 'discard')"
                      >
                        放弃新稿
                      </button>
                    </div>
                  </li>
                </ul>
              </template>

              <template v-else>
                <p v-if="!errorCount" class="wiki-drawer-empty">暂无失败记录</p>
                <template v-else>
                  <p class="wiki-drawer-hint">
                    多为模型返回空 JSON 或格式错误。可重试失败项，或在 Raw 列表中检查对应文件。
                  </p>
                  <div class="wiki-drawer-actions">
                    <button
                      type="button"
                      class="drawer-retry-btn"
                      :disabled="ingestActive"
                      @click="emit('retry')"
                    >
                      重试失败项
                    </button>
                  </div>
                  <ul class="ingest-errors">
                    <li v-for="(err, i) in errors" :key="i">
                      <span class="err-file" :title="err.raw">{{ shortRawPath(err.raw) }}</span>
                      <span class="err-msg">{{ err.error }}</span>
                    </li>
                  </ul>
                </template>
              </template>
            </div>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.wiki-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2800;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
}

.wiki-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 2801;
  display: flex;
  flex-direction: column;
  width: min(440px, 100vw);
  height: 100%;
  background: $bg-card;
  border-left: 1px solid $glass-border;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.12);
}

.wiki-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid $glass-border;
}

.wiki-drawer-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.wiki-drawer-close {
  display: flex;
  padding: 6px;
  border-radius: 8px;
  color: $text-muted;

  &:hover {
    color: $text-primary;
    background: $accent-light;
  }
}

.wiki-drawer-tabs {
  display: flex;
  gap: 6px;
  padding: 0 12px 12px;
  border-bottom: 1px solid $glass-border;
}

.wiki-drawer-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid transparent;
  color: $text-secondary;
  background: transparent;

  &:hover:not(:disabled) {
    background: $accent-light;
    color: $text-primary;
  }

  &.active {
    border-color: rgba(45, 138, 78, 0.35);
    background: $accent-light;
    color: $accent;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.wiki-drawer-badge {
  min-width: 18px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  border-radius: 999px;
  text-align: center;

  &.warn {
    color: #8a6a12;
    background: rgba(184, 134, 11, 0.2);
  }

  &.danger {
    color: #a05050;
    background: rgba(180, 60, 60, 0.15);
  }
}

.wiki-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 20px;
}

.wiki-drawer-hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: $text-secondary;
}

.wiki-drawer-empty {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: $text-muted;
}

.wiki-drawer-actions {
  margin-bottom: 12px;
}

.drawer-retry-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  color: $accent;
  border: 1px solid $accent;
  background: #fff;

  &:hover:not(:disabled) {
    background: $accent-light;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.conflict-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.conflict-item {
  padding: 12px 0;
  border-top: 1px solid rgba(184, 134, 11, 0.2);

  &:first-child {
    border-top: none;
    padding-top: 0;
  }

  &.is-processing {
    margin: 0 -8px;
    padding: 12px 8px;
    border-radius: 8px;
    background: rgba(45, 138, 78, 0.08);
    border: 1px solid rgba(45, 138, 78, 0.28);
  }

  &.is-waiting {
    opacity: 0.55;
    pointer-events: none;
  }
}

.conflict-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  font-size: 12px;
  color: $text-secondary;

  strong {
    color: $text-primary;
    font-size: 13px;
  }
}

.conflict-path {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  word-break: break-all;
}

.conflict-sim {
  font-size: 11px;
  color: $text-muted;
}

.conflict-status {
  font-size: 11px;
  font-weight: 600;
  color: $accent;
}

.conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.conflict-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid $glass-border;
  background: rgba(255, 255, 255, 0.9);
  color: $text-primary;

  &:hover:not(:disabled) {
    border-color: $accent;
    background: $accent-light;
  }

  &.muted {
    color: $text-muted;
  }

  &:disabled {
    opacity: 0.72;
    cursor: wait;
  }
}

.ingest-errors {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: none;

  li {
    display: flex;
    gap: 8px;
    padding: 8px 0;
    border-top: 1px solid rgba(180, 60, 60, 0.12);
    font-size: 12px;
    color: #a05050;
  }

  .err-file {
    flex-shrink: 0;
    max-width: 42%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .err-msg {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }
}

.wiki-drawer-fade-enter-active,
.wiki-drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.wiki-drawer-fade-enter-from,
.wiki-drawer-fade-leave-to {
  opacity: 0;
}

.wiki-drawer-slide-enter-active,
.wiki-drawer-slide-leave-active {
  transition: transform 0.24s ease;
}

.wiki-drawer-slide-enter-from,
.wiki-drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>
