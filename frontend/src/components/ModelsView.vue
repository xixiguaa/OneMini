<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { CAPABILITY_LABELS } from '../config/defaults'
import ModelAddPanel from './ModelAddPanel.vue'
import ModelDetailPanel from './ModelDetailPanel.vue'
import { useSettingsStore } from '../stores/settings'
import ModelLogo from './ModelLogo.vue'
import type { ModelCapability, ModelConfig } from '../types/agent'

const settings = useSettingsStore()
const selectedId = ref<string | null>('deepseek-v4-pro')
const rightMode = ref<'detail' | 'add'>('detail')

const caps: ModelCapability[] = ['chat', 'image', 'video', 'world']

const grouped = computed(() =>
  caps.map((cap) => ({
    cap,
    label: CAPABILITY_LABELS[cap],
    models: settings.settings.models.filter((m) => m.capability === cap),
  })),
)

const selectedModel = computed(() =>
  settings.settings.models.find((m) => m.id === selectedId.value) ?? null,
)

function selectModel(m: ModelConfig) {
  selectedId.value = m.id
  rightMode.value = 'detail'
}

function openAdd() {
  rightMode.value = 'add'
}

function onSaved(id: string) {
  selectedId.value = id
  rightMode.value = 'add'
}

function pickSelectionAfterDelete(removedId: string, capability: ModelCapability) {
  const remaining = settings.settings.models.filter(
    (m) => m.capability === capability && m.id !== removedId,
  )
  const fallback =
    capability === 'chat'
      ? 'deepseek-v4-pro'
      : settings.settings.models.find((m) => m.id !== removedId)?.id
  const next = remaining[0]?.id ?? fallback ?? 'deepseek-v4-pro'
  selectedId.value = settings.getModel(next) ? next : 'deepseek-v4-pro'
  rightMode.value = 'detail'
}

async function onQuickDelete(m: ModelConfig, e: MouseEvent) {
  e.stopPropagation()
  if (!settings.canDeleteModel(m.id)) return
  const ok = window.confirm(`确定删除「${m.name}」？`)
  if (!ok) return
  const cap = m.capability
  const removed = await settings.removeModel(m.id)
  if (removed) pickSelectionAfterDelete(m.id, cap)
}

function onModelDeleted(payload: { id: string; capability: ModelCapability }) {
  pickSelectionAfterDelete(payload.id, payload.capability)
}

function modelState(m: ModelConfig) {
  if (m.enabled) return '已启用'
  if (m.secretConfigured || m.provider === 'tencent') return '待启用'
  return '未配置'
}
</script>

<template>
  <div class="models-page">
    <div class="split-layout">
      <aside class="model-list card">
        <div
          v-for="group in grouped"
          :key="group.cap"
          class="group"
        >
          <p class="group-label">{{ group.label }}</p>
          <div
            v-for="m in group.models"
            :key="m.id"
            class="model-item-wrap"
          >
            <button
              class="model-item"
              :class="{
                active: selectedId === m.id,
                enabled: m.enabled,
                pending: !m.enabled && !!(m.secretConfigured || m.provider === 'tencent'),
              }"
              @click="selectModel(m)"
            >
              <ModelLogo :model="m" :size="36" />
              <div class="item-text">
                <span class="name">{{ m.name }}</span>
                <span class="state">{{ modelState(m) }}</span>
              </div>
            </button>
            <button
              v-if="settings.canDeleteModel(m.id)"
              type="button"
              class="item-delete"
              title="删除模型"
              @click="onQuickDelete(m, $event)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <button class="add-trigger" @click="openAdd">
          <Plus :size="16" />
          添加自定义模型
        </button>
      </aside>

      <section class="right-panel card">
        <ModelAddPanel v-if="rightMode === 'add'" @saved="onSaved" />
        <ModelDetailPanel v-else :model="selectedModel" @deleted="onModelDeleted" />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.models-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 24px 28px;
}

.split-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

.card {
  background: $bg-card;
  border: 1px solid $glass-border;
  border-radius: $radius-md;
  box-shadow: $shadow-sm;
  min-height: 0;
  overflow: hidden;
}

.model-list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow-y: auto;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 8px 6px;
}

.model-item-wrap {
  position: relative;
  margin-bottom: 4px;

  &:hover .item-delete {
    opacity: 1;
  }
}

.model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 36px 10px 10px;
  border-radius: 10px;
  text-align: left;
  border: 1px solid transparent;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }

  &.active {
    background: $accent-light;
    border-color: $accent;
    box-shadow: inset $active-indicator 0 0 $accent;

    .name {
      color: $text-primary;
      font-weight: 600;
    }
  }

  &.enabled .state {
    color: $accent;
    font-weight: 500;
  }

  &.pending .state {
    color: $accent-gold;
    font-weight: 500;
  }

  :deep(.model-logo) {
    background: var(--logo-surface);
    border-color: var(--logo-surface-border);
  }
}

.item-delete {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: $text-muted;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;

  &:hover {
    color: $color-danger;
    background: $color-danger-soft;
  }
}

.item-text {
  min-width: 0;

  .name {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state {
    display: block;
    font-size: 11px;
    color: $text-secondary;
    margin-top: 2px;
  }
}

.add-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: auto;
  padding: 12px;
  border: 1px dashed $border-light;
  border-radius: 10px;
  font-size: 13px;
  color: $text-secondary;

  &:hover {
    border-color: $accent;
    color: $accent;
    background: $accent-light;
  }
}

.right-panel {
  min-height: 400px;
}

@media (max-width: 768px) {
  .split-layout {
    grid-template-columns: 1fr;
  }
}
</style>
