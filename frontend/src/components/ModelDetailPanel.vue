<script setup lang="ts">
import { computed } from 'vue'
import type { ModelConfig } from '../types/agent'
import { getModelCapabilityLabel, PROVIDER_LABELS } from '../config/defaults'
import { getProviderLogo } from '../config/providers'
import { findModelOption } from '../config/providerModels'
import { useSettingsStore } from '../stores/settings'
import ModelLogo from './ModelLogo.vue'
import SecureApiKeyField from './SecureApiKeyField.vue'

const props = defineProps<{
  model: ModelConfig | null
}>()

const settings = useSettingsStore()

async function onConfigureModel(
  payload: { apiKey?: string; enable: boolean },
) {
  if (!props.model) return
  const wasEnabled = props.model.enabled
  if (payload.apiKey) {
    await settings.saveModelSecret(props.model.id, payload.apiKey)
  }
  if (payload.enable || wasEnabled) {
    settings.enableModel(props.model.id)
    settings.bindModelToSkill(props.model.id)
  }
}

const isActiveForSkill = computed(() => {
  if (!props.model) return false
  const skillMap = {
    chat: 'chat',
    multimodal: 'chat',
    image: 'image',
    video: 'video',
    world: 'world',
  } as const
  const skillId = skillMap[props.model.capability as keyof typeof skillMap]
  if (!skillId) return false
  return settings.getSkill(skillId)?.defaultModelId === props.model.id
})

function useThisModel() {
  if (!props.model) return
  settings.bindModelToSkill(props.model.id)
}

const modelOptionLabel = computed(() => {
  if (!props.model) return ''
  const opt = findModelOption(props.model.provider, props.model.capability, props.model.model)
  return opt?.label ?? props.model.model
})
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
        <p>{{ PROVIDER_LABELS[model.provider] }} · {{ getModelCapabilityLabel(model.capability) }}</p>
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

    <div v-if="model.enabled && ['chat', 'multimodal', 'image', 'video', 'world'].includes(model.capability)" class="use-model-row">
      <p v-if="isActiveForSkill" class="use-hint active">当前已在对话/创作中使用此模型</p>
      <button v-else type="button" class="use-btn" @click="useThisModel">设为当前使用模型</button>
    </div>
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

.use-model-row {
  margin-top: 4px;
}

.use-hint {
  font-size: 12px;
  color: $text-secondary;

  &.active {
    color: $accent;
    font-weight: 500;
  }
}

.use-btn {
  padding: 8px 14px;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 12px;
  color: $text-secondary;
  background: $btn-ghost-bg;

  &:hover {
    border-color: $accent;
    color: $accent;
    background: $accent-light;
  }
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
