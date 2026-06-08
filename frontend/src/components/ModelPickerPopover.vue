<script setup lang="ts">
import { Check, ChevronDown, Search, X } from 'lucide-vue-next'
import LoadingIndicator from './LoadingIndicator.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { loadModelPickerOptions } from '../api/models'
import { getModelCapabilityLabel } from '../config/defaults'
import { getProviderLogo, getProviderLabel } from '../config/providers'
import type { ModelCatalogResponse, PickerModelOption } from '../types/modelCatalog'
import type { ModelCapability, ModelProvider } from '../types/agent'

const props = defineProps<{
  provider: ModelProvider
  capability: ModelCapability
  modelValue: string
  /** 已选预设的显示名（与 modelValue 可来自自定义输入） */
  selectedLabel?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [model: string]
  select: [option: PickerModelOption]
}>()

const open = ref(false)
const loading = ref(false)
const query = ref('')
const rootRef = ref<HTMLElement | null>(null)
const catalog = ref<ModelCatalogResponse | null>(null)
const options = ref<PickerModelOption[]>([])

const matchedPreset = computed(() =>
  options.value.find((o) => o.model === props.modelValue),
)

const displayLabel = computed(() => {
  if (props.selectedLabel?.trim()) return props.selectedLabel
  if (matchedPreset.value) return matchedPreset.value.label
  return '从列表选择预设模型'
})

const filteredCatalog = computed(() => {
  const base = catalog.value
  if (!base) return null

  const q = query.value.trim().toLowerCase()
  const categories = base.categories
    .map((cat) => ({
      ...cat,
      models: cat.models.filter((m) => {
        if (!m.model?.trim()) return false
        if (!q) return true
        return (
          m.label.toLowerCase().includes(q) ||
          m.model.toLowerCase().includes(q) ||
          (m.description?.toLowerCase().includes(q) ?? false)
        )
      }),
    }))
    .filter((cat) => cat.models.length > 0)

  return { ...base, categories }
})

const hasModels = computed(() => (filteredCatalog.value?.categories.length ?? 0) > 0)

async function loadCatalog() {
  loading.value = true
  try {
    const result = await loadModelPickerOptions(props.provider, props.capability)
    catalog.value = result.catalog
    options.value = result.options
  } finally {
    loading.value = false
  }
}

function toggle(e: MouseEvent) {
  e.stopPropagation()
  if (props.disabled) return
  open.value = !open.value
  if (open.value && !catalog.value) loadCatalog()
}

function close() {
  open.value = false
  query.value = ''
}

function pick(opt: PickerModelOption) {
  if (!opt.model?.trim()) return
  emit('update:modelValue', opt.model)
  emit('select', opt)
  close()
}

function onDocClick(e: MouseEvent) {
  if (!rootRef.value?.contains(e.target as Node)) close()
}

watch([() => props.provider, () => props.capability], () => {
  catalog.value = null
  options.value = []
  if (open.value) loadCatalog()
})

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootRef" class="model-picker">
    <button
      type="button"
      class="picker-trigger"
      :class="{ open, placeholder: !matchedPreset && !selectedLabel }"
      :disabled="disabled"
      @click="toggle"
    >
      <img
        :src="getProviderLogo(provider)"
        :alt="getProviderLabel(provider)"
        class="trigger-logo"
        width="20"
        height="20"
      />
      <span
        class="trigger-text"
        :title="matchedPreset || selectedLabel ? displayLabel : undefined"
      >{{ displayLabel }}</span>
      <ChevronDown :size="16" class="chevron" :class="{ open }" />
    </button>

    <div v-if="open" class="picker-panel" role="dialog" aria-label="选择预设模型">
      <header class="panel-head">
        <h4>选择预设模型</h4>
        <div class="head-actions">
          <div class="search-wrap embedded-field">
            <Search :size="14" />
            <input v-model="query" type="search" placeholder="搜索" @click.stop />
          </div>
          <button type="button" class="icon-btn" title="关闭" @click.stop="close">
            <X :size="16" />
          </button>
        </div>
      </header>

      <p class="panel-meta">
        {{ getProviderLabel(provider) }} · {{ getModelCapabilityLabel(capability) }}
      </p>

      <LoadingIndicator v-if="loading" label="加载中…" variant="block" class="panel-loading" />

      <div v-else class="panel-body">
        <template v-if="hasModels">
          <section
            v-for="cat in filteredCatalog!.categories"
            :key="cat.id"
            class="category"
          >
            <h5 v-if="filteredCatalog!.categories.length > 1" class="category-title">
              {{ cat.label }}
            </h5>
            <ul class="model-list">
              <li v-for="m in cat.models" :key="m.id">
                <button
                  type="button"
                  class="model-row"
                  :class="{ active: modelValue === m.model }"
                  @click="pick({ ...m, categoryId: cat.id, categoryLabel: cat.label })"
                >
                  <img
                    :src="getProviderLogo(provider)"
                    :alt="m.label"
                    class="row-logo"
                    width="28"
                    height="28"
                  />
                  <div class="row-main">
                    <div class="row-title">
                      <span class="row-name">{{ m.label }}</span>
                      <span
                        v-for="tag in m.tags"
                        :key="tag.text"
                        class="tag"
                        :class="tag.variant || 'info'"
                      >
                        {{ tag.text }}
                      </span>
                    </div>
                    <p class="row-id">{{ m.model }}</p>
                    <p v-if="m.description" class="row-desc">{{ m.description }}</p>
                  </div>
                  <Check v-if="modelValue === m.model" :size="18" class="check" />
                </button>
              </li>
            </ul>
          </section>
        </template>
        <p v-else class="empty">
          暂无该服务商的预设列表，请关闭后在下方直接填写模型 ID。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.model-picker {
  position: relative;
}

.picker-trigger {
  @include cosmic.cosmic-glass-select-trigger(8px);
  gap: 10px;
  padding: 10px 34px 10px 12px;

  &.placeholder .trigger-text {
    color: $text-muted;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.trigger-logo {
  flex-shrink: 0;
  border-radius: 6px;
  object-fit: contain;
  background: var(--logo-surface);
  border: 1px solid var(--logo-surface-border);
  padding: 2px;
  box-sizing: border-box;
}

.trigger-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex-shrink: 0;
  color: $text-muted;
  transition: transform 0.15s ease;

  &.open {
    transform: rotate(180deg);
  }
}

.picker-panel {
  position: absolute;
  z-index: 50;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: min(420px, 60vh);
  display: flex;
  flex-direction: column;
  border-radius: var(--glass-radius-md, 20px);
  background: var(--select-menu-bg, var(--composer-menu-bg));
  backdrop-filter: blur(16px) saturate(1.25);
  -webkit-backdrop-filter: blur(16px) saturate(1.25);
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow-hover, $shadow-md);
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid $border-light;

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
    flex-shrink: 0;
  }
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
}

.search-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  max-width: 180px;
  padding: 6px 10px;
  border-radius: 8px;
  background: $bg-input;
  border: 1px solid $border-light;
  color: $text-muted;

  input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-size: 12px;
    color: $text-primary;
    outline: none;

    &:focus,
    &:focus-visible {
      outline: none;
      border: none;
      box-shadow: none;
    }

    &::placeholder {
      color: $text-muted;
    }
  }
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: $text-muted;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }
}

.panel-meta {
  padding: 0 14px 8px;
  font-size: 11px;
  color: $text-muted;
}

.panel-loading,
.empty {
  padding: 20px 14px;
  text-align: center;
  font-size: 13px;
  color: $text-muted;
  line-height: 1.5;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px 12px;
}

.category + .category {
  margin-top: 4px;
}

.category-title {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  padding: 4px 4px 8px;
}

.model-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-row {
  @include cosmic.cosmic-glass-dropdown-option;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
}

.row-logo {
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: contain;
  background: var(--logo-surface);
  border: 1px solid var(--logo-surface-border);
  padding: 3px;
  box-sizing: border-box;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.row-name {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;

  &.beta {
    background: rgba(255, 152, 0, 0.15);
    color: #e65100;
  }

  &.preview {
    background: rgba(156, 39, 176, 0.12);
    color: #7b1fa2;
  }

  &.featured {
    background: rgba(103, 58, 183, 0.12);
    color: #512da8;
  }

  &.info {
    background: $accent-light;
    color: $accent;
  }
}

.row-id {
  font-size: 11px;
  color: $text-muted;
  margin-top: 4px;
  word-break: break-all;
}

.row-desc {
  font-size: 11px;
  color: $text-secondary;
  margin-top: 4px;
  line-height: 1.4;
}

.check {
  flex-shrink: 0;
  color: $accent;
  margin-top: 2px;
}
</style>
