<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Plus } from 'lucide-vue-next'
import { CAPABILITY_LABELS } from '../config/defaults'
import { getProviderDefinition } from '../config/providers'
import {
  getModelOptions,
  getProvidersForCapability,
  type ProviderModelOption,
} from '../config/providerModels'
import ProviderSelect from './ProviderSelect.vue'
import { useSettingsStore } from '../stores/settings'
import SecureApiKeyField from './SecureApiKeyField.vue'
import type { ModelCapability, ModelProvider } from '../types/agent'

const emit = defineEmits<{ saved: [id: string] }>()

const settings = useSettingsStore()
const savedModelId = ref<string | null>(null)

const form = reactive({
  name: '',
  capability: 'chat' as ModelCapability,
  provider: 'deepseek' as ModelProvider,
  modelId: '',
  baseUrl: '',
  apiKey: '',
  description: '',
})

const providers = computed(() => getProvidersForCapability(form.capability))

const modelOptions = computed(() => getModelOptions(form.provider, form.capability))

const selectedOption = computed(() =>
  modelOptions.value.find((o) => o.model === form.modelId),
)

watch(
  () => form.capability,
  () => {
    const list = getProvidersForCapability(form.capability)
    if (!list.includes(form.provider)) form.provider = list[0] ?? 'openai'
  },
)

watch(
  [() => form.provider, () => form.capability],
  () => {
    const def = getProviderDefinition(form.provider)
    if (def.defaultBaseUrl && !form.baseUrl.trim()) {
      form.baseUrl = def.defaultBaseUrl
    }
    const opts = getModelOptions(form.provider, form.capability)
    if (!opts.some((o) => o.model === form.modelId)) {
      form.modelId = opts[0]?.model ?? ''
      applyOptionDefaults(opts[0])
    }
  },
  { immediate: true },
)

watch(selectedOption, (opt) => {
  if (opt) applyOptionDefaults(opt)
})

function applyOptionDefaults(opt?: ProviderModelOption) {
  if (!opt) return
  if (opt.baseUrl) form.baseUrl = opt.baseUrl
  if (!form.name.trim()) form.name = opt.label
  if (opt.description) form.description = opt.description
}

function onSelectModel() {
  applyOptionDefaults(selectedOption.value)
}

function saveModel() {
  const opt = selectedOption.value
  if (!opt?.model && form.provider !== 'tencent') {
    alert('请选择具体模型')
    return
  }
  if (!form.provider) {
    alert('请选择服务商')
    return
  }

  const id = settings.addCustomModel({
    name: form.name.trim() || opt?.label || '未命名模型',
    model: opt?.model || form.modelId,
    capability: form.capability,
    provider: form.provider,
    baseUrl: form.baseUrl.trim() || opt?.baseUrl,
    apiKey: undefined,
    enabled: false,
    description: form.description.trim() || opt?.description || '',
  })

  savedModelId.value = id
  emit('saved', id)
}

function resetForm() {
  savedModelId.value = null
  Object.assign(form, {
    name: '',
    capability: 'chat',
    provider: 'deepseek',
    modelId: '',
    baseUrl: '',
    apiKey: '',
    description: '',
  })
  const opts = getModelOptions(form.provider, form.capability)
  form.modelId = opts[0]?.model ?? ''
  applyOptionDefaults(opts[0])
}

const pendingModel = computed(() =>
  savedModelId.value ? settings.getModel(savedModelId.value) : null,
)
</script>

<template>
  <div class="add-panel">
    <h3>
      <Plus :size="18" />
      添加自定义模型
    </h3>
    <p class="hint">先选能力类型与服务商，再选具体模型；显示名称可随意，服务商与模型标识决定 API 调用。</p>

    <template v-if="!savedModelId">
      <label>
        <span>能力类型 <em>*</em></span>
        <select v-model="form.capability">
          <option v-for="(label, key) in CAPABILITY_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>

      <div class="field-block">
        <span class="field-label">服务商 <em>*</em></span>
        <ProviderSelect v-model="form.provider" :providers="providers" />
      </div>

      <label>
        <span>具体模型 <em>*</em></span>
        <select v-model="form.modelId" @change="onSelectModel">
          <option v-for="opt in modelOptions" :key="opt.model" :value="opt.model">
            {{ opt.label }} — {{ opt.model }}
          </option>
        </select>
      </label>

      <label>
        <span>显示名称</span>
        <input v-model="form.name" placeholder="可选，默认使用模型名称" />
      </label>

      <label>
        <span>API Base URL</span>
        <input v-model="form.baseUrl" placeholder="选择模型后自动填充，可修改" />
      </label>

      <p v-if="form.provider === 'tencent'" class="hint block">腾讯云模型使用服务端 .env 密钥，添加后在右侧点击「启用」。</p>
      <p v-else class="hint block">API Key 在保存模型后于下方粘贴并点击「启用」。</p>

      <label>
        <span>备注</span>
        <input v-model="form.description" placeholder="可选" />
      </label>

      <button type="button" class="save-btn" @click="saveModel">保存模型</button>
    </template>

    <template v-else-if="pendingModel">
      <p class="success">模型已保存，请粘贴 API Key 并点击「启用」。</p>
      <SecureApiKeyField
        :api-key="pendingModel.apiKey || ''"
        :enabled="pendingModel.enabled"
        :provider="pendingModel.provider"
        :is-tencent="pendingModel.provider === 'tencent'"
        @save="settings.setModelApiKey(pendingModel.id, $event)"
        @enable="settings.enableModel(pendingModel.id)"
        @cancel="settings.revokeModelApiKey(pendingModel.id)"
        @disable="settings.disableModel(pendingModel.id)"
      />
      <button type="button" class="ghost-btn" @click="resetForm">继续添加其他模型</button>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.add-panel {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  margin-bottom: 8px;
}

.hint {
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
  margin-bottom: 16px;

  &.block {
    margin: -8px 0 14px;
  }

  em {
    color: #c44;
    font-style: normal;
  }
}

.success {
  font-size: 13px;
  color: $accent;
  margin-bottom: 12px;
  font-weight: 500;
}

.field-block {
  margin-bottom: 14px;
}

.field-label {
  display: block;
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;

  em {
    color: $color-danger;
    font-style: normal;
  }
}

label {
  display: block;
  margin-bottom: 14px;

  span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 6px;
  }

  input,
  select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid $border-light;
    border-radius: 8px;
    font-size: 13px;
    color: $text-primary;
  }

  select {
    padding-right: 34px;
  }
}

.save-btn {
  width: 100%;
  padding: 12px;
  margin-top: 8px;
  background: $accent;
  color: $btn-primary-text;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;

  &:hover {
    background: $accent-hover;
    box-shadow: $shadow-glow;
  }
}

.ghost-btn {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  border: 1px dashed $btn-ghost-border;
  border-radius: 8px;
  font-size: 13px;
  background: $btn-ghost-bg;
  color: $btn-ghost-text;

  &:hover {
    border-color: $accent;
    background: $btn-ghost-hover-bg;
    color: $btn-ghost-hover-text;
  }
}
</style>
