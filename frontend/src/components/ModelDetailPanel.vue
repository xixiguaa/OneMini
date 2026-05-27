<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { ModelCapability, ModelConfig } from '../types/agent'
import { CAPABILITY_LABELS, PROVIDER_LABELS } from '../config/defaults'
import { getProviderLogo } from '../config/providers'
import { findModelOption } from '../config/providerModels'
import { useSettingsStore } from '../stores/settings'
import ModelLogo from './ModelLogo.vue'
import SecureApiKeyField from './SecureApiKeyField.vue'

const props = defineProps<{
  model: ModelConfig | null
}>()

const emit = defineEmits<{
  deleted: [payload: { id: string; capability: ModelCapability }]
}>()

const settings = useSettingsStore()
const deleting = ref(false)

const canDelete = computed(
  () => !!props.model && settings.canDeleteModel(props.model.id),
)

async function onConfigureModel(
  payload: { apiKey?: string; enable: boolean },
) {
  if (!props.model) return
  if (payload.apiKey) {
    await settings.saveModelSecret(props.model.id, payload.apiKey)
  }
  if (payload.enable) settings.enableModel(props.model.id)
}

const modelOptionLabel = computed(() => {
  if (!props.model) return ''
  const opt = findModelOption(props.model.provider, props.model.capability, props.model.model)
  return opt?.label ?? props.model.model
})

async function onDeleteModel() {
  const m = props.model
  if (!m || !canDelete.value) return
  const ok = window.confirm(
    `确定删除模型「${m.name}」？\n\n将同时清除服务端保存的 API Key，且无法恢复。`,
  )
  if (!ok) return
  deleting.value = true
  try {
    const removed = await settings.removeModel(m.id)
    if (removed) emit('deleted', { id: m.id, capability: m.capability })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="model" class="detail">
    <div class="detail-head">
      <ModelLogo :model="model" :size="48" class="logo" />
      <div class="head-meta">
        <label class="name-field">
          <span>显示名称</span>
          <input
            :value="model.name"
            placeholder="自定义名称"
            @input="settings.updateModel(model.id, { name: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <p>{{ PROVIDER_LABELS[model.provider] }} · {{ CAPABILITY_LABELS[model.capability] }}</p>
      </div>
    </div>

    <p v-if="model.description" class="desc">{{ model.description }}</p>

    <label class="field">
      <span>服务商</span>
      <div class="readonly provider-readonly">
        <img
          :src="getProviderLogo(model.provider)"
          :alt="PROVIDER_LABELS[model.provider]"
          class="provider-chip-logo"
          width="22"
          height="22"
        />
        <span>{{ PROVIDER_LABELS[model.provider] }}</span>
      </div>
    </label>

    <label class="field">
      <span>具体模型</span>
      <code class="readonly">{{ modelOptionLabel }}（{{ model.model }}）</code>
    </label>

    <SecureApiKeyField
      :configured="!!model.secretConfigured"
      :hint="model.secretHint"
      :enabled="model.enabled"
      :provider="model.provider"
      :is-tencent="model.provider === 'tencent'"
      @configure="onConfigureModel"
      @cancel="settings.revokeModelApiKey(model.id)"
      @disable="settings.disableModel(model.id)"
    />

    <label class="field">
      <span>API Base URL（可选）</span>
      <input
        :value="model.baseUrl || ''"
        placeholder="默认官方地址"
        @input="settings.updateModel(model.id, { baseUrl: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <section v-if="canDelete" class="danger-zone">
      <h4 class="danger-title">危险操作</h4>
      <p class="danger-hint">删除后将从列表移除，服务端密钥一并清除。</p>
      <button
        type="button"
        class="btn-delete"
        :disabled="deleting"
        @click="onDeleteModel"
      >
        <Trash2 :size="16" />
        {{ deleting ? '删除中…' : '删除此模型' }}
      </button>
    </section>

    <p v-else-if="model.preset" class="preset-note">内置模型不可删除，可在上方停用或更换 API Key。</p>
  </div>

  <div v-else class="empty">
    <p>← 选择左侧模型进行配置</p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.detail {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.detail-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 16px;

  .logo {
    box-shadow: $shadow-sm;
  }
}

.head-meta {
  flex: 1;
  min-width: 0;

  p {
    font-size: 12px;
    color: $text-secondary;
    margin-top: 6px;
  }
}

.name-field {
  display: block;

  span {
    display: block;
    font-size: 11px;
    color: $text-muted;
    margin-bottom: 4px;
  }

  input {
    width: 100%;
    padding: 8px 10px;
    font-size: 16px;
    font-weight: 600;
    background: $bg-input;
    border: 1px solid $border-light;
    border-radius: 8px;

    &:focus {
      border-color: $accent;
      box-shadow: $shadow-focus;
    }
  }
}

.desc {
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.5;
  margin-bottom: 16px;
}

.field {
  display: block;
  margin-bottom: 14px;

  > span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 8px;
  }

  input {
    width: 100%;
    padding: 10px 12px;
    background: $bg-input;
    border: 1px solid $border-light;
    border-radius: 8px;
    font-size: 13px;

    &:focus {
      border-color: $accent;
      box-shadow: $shadow-focus;
    }
  }
}

.readonly {
  display: block;
  padding: 10px 12px;
  background: $bg-input;
  border-radius: 8px;
  font-size: 12px;
  color: $text-primary;
}

.provider-readonly {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid $border-light;
}

.provider-chip-logo {
  border-radius: 6px;
  object-fit: contain;
  background: var(--logo-surface);
  border: 1px solid var(--logo-surface-border);
  padding: 3px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.danger-zone {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid $border-light;
}

.danger-title {
  font-size: 12px;
  font-weight: 600;
  color: $color-danger;
  margin-bottom: 6px;
}

.danger-hint {
  font-size: 11px;
  color: $text-muted;
  line-height: 1.45;
  margin-bottom: 12px;
}

.btn-delete {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  font-size: 13px;
  color: $color-danger;
  background: $color-danger-soft;
  border: 1px solid rgba(196, 68, 68, 0.35);
  border-radius: 8px;
  transition: background 0.15s, opacity 0.15s;

  &:hover:not(:disabled) {
    background: rgba(196, 68, 68, 0.2);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.preset-note {
  margin-top: 24px;
  padding: 10px 12px;
  font-size: 12px;
  color: $text-muted;
  background: $bg-input;
  border-radius: 8px;
  line-height: 1.45;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-muted;
  font-size: 14px;
}
</style>
