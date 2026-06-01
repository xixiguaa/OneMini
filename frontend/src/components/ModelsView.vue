<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import {
  getModelConfigGroup,
  getVisionMediaLabel,
  MODEL_CONFIG_GROUPS,
  MULTIMODAL_FEATURE_TAGS,
  type ModelConfigGroupId,
} from '../config/defaults'
import { isModelReady } from '../utils/resolveModel'
import ConfirmDialog from './ConfirmDialog.vue'
import ModelAddPanel from './ModelAddPanel.vue'
import ModelDetailPanel from './ModelDetailPanel.vue'
import { useSettingsStore } from '../stores/settings'
import ModelLogo from './ModelLogo.vue'
import type { ModelConfig } from '../types/agent'

const settings = useSettingsStore()
const {
  open: confirmOpen,
  loading: confirmLoading,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel: confirmConfirmLabel,
  cancelLabel: confirmCancelLabel,
  danger: confirmDanger,
  confirm: showConfirm,
  setLoading: setConfirmLoading,
  close: closeConfirm,
  onCancel: onConfirmCancel,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

const deleteTarget = ref<ModelConfig | null>(null)
const selectedId = ref<string | null>('deepseek-v4-pro')
const rightMode = ref<'detail' | 'add'>('detail')
const addGroupId = ref<ModelConfigGroupId>('language')
/** 每次点「+」递增，强制重建添加面板（避免停在 API Key 步骤时重复点加号无反应） */
const addPanelSession = ref(0)

const grouped = computed(() =>
  MODEL_CONFIG_GROUPS.map((group) => ({
    ...group,
    models: settings.settings.models.filter((m) => group.capabilities.includes(m.capability)),
  })),
)

const selectedModel = computed(() =>
  settings.settings.models.find((m) => m.id === selectedId.value) ?? null,
)

function selectModel(m: ModelConfig) {
  selectedId.value = m.id
  rightMode.value = 'detail'
  const group = getModelConfigGroup(m.capability)
  if (group) addGroupId.value = group.id
  if (isModelReady(m)) {
    settings.bindModelToSkill(m.id)
  }
}

function openAdd(groupId: ModelConfigGroupId) {
  addGroupId.value = groupId
  rightMode.value = 'add'
  addPanelSession.value += 1
}

function onSaved(id: string) {
  selectedId.value = id
  rightMode.value = 'add'
}

function pickSelectionAfterDelete(removedId: string, capability: ModelConfig['capability']) {
  const remaining = settings.settings.models.filter(
    (m) => m.capability === capability && m.id !== removedId,
  )
  const fallback =
    capability === 'chat' || capability === 'multimodal'
      ? 'deepseek-v4-pro'
      : settings.settings.models.find((m) => m.id !== removedId)?.id
  const next = remaining[0]?.id ?? fallback ?? 'deepseek-v4-pro'
  selectedId.value = settings.getModel(next) ? next : 'deepseek-v4-pro'
  rightMode.value = 'detail'
}

function requestDeleteModel(m: ModelConfig, e?: MouseEvent) {
  e?.stopPropagation()
  if (!settings.canDeleteModel(m.id)) return
  deleteTarget.value = m
  void showConfirm({
    title: '删除模型',
    message: `确定删除「${m.name}」？\n\n将从列表移除，服务端 API Key 一并清除，且无法恢复。`,
    confirmLabel: '删除',
    cancelLabel: '取消',
    danger: true,
  })
}

async function onConfirmDelete() {
  const m = deleteTarget.value
  if (!m) {
    closeConfirm(false)
    return
  }
  setConfirmLoading(true)
  try {
    const removed = await settings.removeModel(m.id)
    if (removed) pickSelectionAfterDelete(m.id, m.capability)
    deleteTarget.value = null
    closeConfirm(true)
  } finally {
    setConfirmLoading(false)
  }
}

function onCancelDelete() {
  deleteTarget.value = null
  onConfirmCancel()
}

function modelState(m: ModelConfig) {
  if (m.enabled) return '已启用'
  if (m.secretConfigured || m.provider === 'tencent') return '待启用'
  return '未配置'
}

function modelMeta(m: ModelConfig) {
  const state = modelState(m)
  const tags: string[] = []
  if (m.capability === 'multimodal') {
    tags.push(MULTIMODAL_FEATURE_TAGS.slice(0, 3).join(' / '))
  }
  if (m.capability === 'image' || m.capability === 'video') {
    tags.push(getVisionMediaLabel(m.capability))
  }
  const skillId =
    m.capability === 'chat' || m.capability === 'multimodal'
      ? 'chat'
      : m.capability === 'image'
        ? 'image'
        : m.capability === 'video'
          ? 'video'
          : m.capability === 'world'
            ? 'world'
            : null
  if (skillId && settings.getSkill(skillId)?.defaultModelId === m.id) {
    tags.push('使用中')
  }
  tags.push(state)
  return tags.join(' · ')
}
</script>

<template>
  <div class="models-page">
    <div class="split-layout">
      <aside class="model-list card">
        <div
          v-for="group in grouped"
          :key="group.id"
          class="group"
          :class="{ 'group-active': rightMode === 'add' && addGroupId === group.id }"
        >
          <div class="group-head">
            <p class="group-label">{{ group.label }}</p>
            <button
              type="button"
              class="group-add"
              :title="`添加${group.label}`"
              @click="openAdd(group.id)"
            >
              <Plus :size="14" />
            </button>
          </div>
          <div
            v-for="m in group.models"
            :key="m.id"
            class="model-item-wrap"
          >
            <button
              class="model-item"
              :class="{
                active: rightMode === 'detail' && selectedId === m.id,
                enabled: m.enabled,
                pending: !m.enabled && !!(m.secretConfigured || m.provider === 'tencent'),
              }"
              :title="m.name"
              @click="selectModel(m)"
            >
              <ModelLogo :model="m" :size="36" />
              <div class="item-text">
                <span class="name">{{ m.name }}</span>
                <span class="state">{{ modelMeta(m) }}</span>
              </div>
            </button>
            <button
              v-if="settings.canDeleteModel(m.id)"
              type="button"
              class="item-delete"
              title="删除模型"
              @click="requestDeleteModel(m, $event)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
          <p v-if="!group.models.length" class="group-empty">暂无模型</p>
        </div>
      </aside>

      <section class="right-panel card">
        <ModelAddPanel
          v-if="rightMode === 'add'"
          :key="`${addGroupId}-${addPanelSession}`"
          :group-id="addGroupId"
          @saved="onSaved"
        />
        <ModelDetailPanel v-else :model="selectedModel" />
      </section>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :loading="confirmLoading"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmConfirmLabel"
      :cancel-label="confirmCancelLabel"
      :danger="confirmDanger"
      @update:open="onConfirmOpenUpdate"
      @confirm="onConfirmDelete"
      @cancel="onCancelDelete"
    />
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
  min-height: 0;
  overflow: hidden;
}

.model-list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow-y: auto;
  gap: 8px;
}

.group {
  padding-bottom: 4px;

  &.group-active {
    .group-head {
      color: $accent;
    }
  }
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 6px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.group-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: $text-muted;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: $accent;
    background: $accent-light;
  }
}

.group-empty {
  padding: 4px 10px 8px;
  font-size: 12px;
  color: $text-muted;
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

.right-panel {
  min-height: 400px;
}

@media (max-width: 768px) {
  .split-layout {
    grid-template-columns: 1fr;
  }
}
</style>
