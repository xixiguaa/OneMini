<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { CAPABILITY_LABELS } from '../config/defaults'
import ModelAddPanel from './ModelAddPanel.vue'
import ModelDetailPanel from './ModelDetailPanel.vue'
import { useSettingsStore } from '../stores/settings'
import ModelLogo from './ModelLogo.vue'
import { BRAND_NAME } from '../utils/modelLogo'
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

function modelState(m: ModelConfig) {
  if (m.enabled) return '已启用'
  if (m.apiKey?.trim() || m.provider === 'tencent') return '待启用'
  return '未配置'
}
</script>

<template>
  <div class="models-page">
    <header class="page-header">
      <h2>模型配置</h2>
      <p>{{ BRAND_NAME }} · 选择模型并在右侧填写 API 密钥</p>
    </header>

    <div class="split-layout">
      <aside class="model-list card">
        <div
          v-for="group in grouped"
          :key="group.cap"
          class="group"
        >
          <p class="group-label">{{ group.label }}</p>
          <button
            v-for="m in group.models"
            :key="m.id"
            class="model-item"
            :class="{
              active: selectedId === m.id,
              enabled: m.enabled,
              pending: !m.enabled && !!(m.apiKey?.trim() || m.provider === 'tencent'),
            }"
            @click="selectModel(m)"
          >
            <ModelLogo :model="m" :size="36" />
            <div class="item-text">
              <span class="name">{{ m.name }}</span>
              <span class="state">{{ modelState(m) }}</span>
            </div>
          </button>
        </div>

        <button class="add-trigger" @click="openAdd">
          <Plus :size="16" />
          添加自定义模型
        </button>
      </aside>

      <section class="right-panel card">
        <ModelAddPanel v-if="rightMode === 'add'" @saved="onSaved" />
        <ModelDetailPanel v-else :model="selectedModel" />
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

.page-header {
  margin-bottom: 20px;

  h2 {
    font-size: 22px;
    font-weight: 600;
  }

  p {
    font-size: 13px;
    color: $text-secondary;
    margin-top: 4px;
  }
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

.model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  margin-bottom: 4px;
  border: 1px solid transparent;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }

  &.active {
    background: $accent-light;
    border-color: $accent;
    box-shadow: inset 3px 0 0 $accent;

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
